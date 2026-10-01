const nativeFs = require('fs/promises')
const path = require('path')
const { randomUUID } = require('crypto')

// Writes and migration are serialized; warm body reads use atomic files directly.
function createMailboxStore(directory, attachments, fs = nativeFs) {
  const cache = new Map()
  const queues = new Map()
  const key = (a, f) => directory(a, f)
  const bodyPath = (dir, uid) => path.join(dir, 'bodies', `${Buffer.from(String(uid)).toString('hex')}.json`)
  async function atomic(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temp, JSON.stringify(data), 'utf8')
      await fs.rename(temp, file)
    } finally { await fs.rm(temp, { force: true }).catch(() => {}) }
  }
  async function read(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')) }
    catch (err) { if (err.code === 'ENOENT') return fallback; throw err }
  }
  async function copyAttachments(a, source, destination, uid, destinationUid) {
    // Copy before committing the destination; failed writes leave the source usable.
    const safe = value => {
      const result = String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      if (!result || result === '.' || result === '..') throw new Error('Identificativo messaggio non valido')
      return result
    }
    const from = path.join(key(a, source), 'attachments', safe(uid))
    const to = path.join(key(a, destination), 'attachments', safe(destinationUid))
    try { await fs.cp(from, to, { recursive: true }) }
    catch (err) { if (err.code !== 'ENOENT') throw err }
  }
  function summary(m) {
    const html = String(m.html || '')
    return {
      uid: m.uid, subject: m.subject, from: m.from, to: m.to, cc: m.cc,
      date: m.date, seen: !!m.seen, remoteUid: m.remoteUid, archived: !!m.archived,
      preview: String(m.text || html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 240),
      attachments: m.attachments || [],
      hasAttachments: (m.attachments || []).some(a => a.disposition !== 'inline' || !a.contentId || !html.toLowerCase().includes(`cid:${String(a.contentId).replace(/^<|>$/g, '').toLowerCase()}`)),
    }
  }
  const ordered = items => items.sort((a, b) => Number(a.seen) - Number(b.seen) || (b.date || 0) - (a.date || 0) || String(a.uid).localeCompare(String(b.uid)))
  function run(a, f, fn) {
    const dir = key(a, f)
    const work = (queues.get(dir) || Promise.resolve()).catch(() => {}).then(async () => fn(await load(dir), dir))
    queues.set(dir, work)
    return work.finally(() => { if (queues.get(dir) === work) queues.delete(dir) })
  }
  async function persist(dir, box) {
    ordered(box.items)
    await atomic(path.join(dir, 'index.json'), box)
    await fs.rm(path.join(dir, 'dirty.json'), { force: true })
    cache.set(dir, box)
  }
  async function load(dir) {
    if (cache.has(dir)) return cache.get(dir)
    let box
    try { box = await read(path.join(dir, 'index.json'), null) } catch { box = null }
    const active = await read(path.join(dir, 'format.json'), null)
    if (active) {
      if (!box || await read(path.join(dir, 'dirty.json'), null)) {
        const sync = await read(path.join(dir, 'sync.json'), {})
        const items = []
        for (const file of await fs.readdir(path.join(dir, 'bodies'))) {
          if (!file.endsWith('.json')) continue
          items.push(summary(await read(path.join(dir, 'bodies', file))))
        }
        box = { version: 2, items, sync }
        await persist(dir, box)
      }
    } else {
      // Never interpret a corrupt legacy archive as an empty mailbox.
      const legacy = await read(path.join(dir, 'messages.json'), [])
      if (!Array.isArray(legacy)) throw new Error('Archivio posta non valido')
      box = { version: 2, items: [], sync: {} }
      try {
        // An interrupted, unactivated conversion is rebuilt from the original.
        await fs.rm(path.join(dir, 'bodies'), { recursive: true, force: true })
        await fs.mkdir(path.join(dir, 'bodies'), { recursive: true })
        for (const m of legacy) {
          await atomic(bodyPath(dir, m.uid), m)
          const verified = await read(bodyPath(dir, m.uid))
          if (JSON.stringify(verified) !== JSON.stringify(m)) throw new Error('Verifica conversione fallita')
          box.items.push(summary(m))
        }
        await atomic(path.join(dir, 'sync.json'), box.sync)
        await persist(dir, box)
        await atomic(path.join(dir, 'format.json'), { version: 2 })
      } catch (err) {
        cache.delete(dir)
        return { legacy, items: ordered(legacy.map(summary)), sync: {}, warning: `Conversione archivio non riuscita: ${err.message}` }
      }
    }
    cache.set(dir, box)
    return box
  }
  async function modify(box, dir, fn) {
    if (box.legacy) {
      await fn()
      await atomic(path.join(dir, 'messages.json'), box.legacy)
      box.items = ordered(box.legacy.map(summary))
      return
    }
    await atomic(path.join(dir, 'dirty.json'), { pending: true })
    try { await fn(); await persist(dir, box) }
    catch (err) { cache.delete(dir); throw err }
  }
  async function get(box, dir, uid) {
    if (box.legacy) return box.legacy.find(m => String(m.uid) === String(uid)) || null
    const item = box.items.find(m => String(m.uid) === String(uid))
    if (!item) return null
    const m = await read(bodyPath(dir, uid), null)
    return m ? { ...m, seen: item.seen } : null
  }
  async function put(box, dir, m) {
    if (box.legacy) {
      const i = box.legacy.findIndex(v => String(v.uid) === String(m.uid))
      if (i < 0) box.legacy.push(m); else box.legacy[i] = m
    } else await atomic(bodyPath(dir, m.uid), m)
    box.items = box.items.filter(v => String(v.uid) !== String(m.uid))
    box.items.push(summary(m))
  }
  const api = {
    reset: () => cache.clear(),
    listMessages: (a, f, opts = {}) => run(a, f, box => {
      const filter = opts.filter || 'all'
      const items = box.items.filter(m => filter === 'all' || (filter === 'read' ? m.seen : !m.seen))
      // The last item's identity survives insertions ahead of the current page.
      const found = opts.cursor == null ? -1 : items.findIndex(m => String(m.uid) === String(opts.cursor))
      const start = found + 1
      const page = items.slice(start, start + 100)
      return { items: page, total: items.length, folderTotal: box.items.length, nextCursor: start + page.length < items.length ? String(page.at(-1).uid) : null, warning: box.warning }
    }),
    getMessage: (a, f, uid) => {
      const dir = key(a, f)
      const box = cache.get(dir)
      // Do not make opening a saved message wait for a bulk flag update.
      return box ? get(box, dir, uid) : run(a, f, (loaded, target) => get(loaded, target, uid))
    },
    saveMessages: (a, f, messages) => run(a, f, (box, dir) => modify(box, dir, async () => {
      for (const m of messages) await put(box, dir, m)
    })),
    setMessageSeen: (a, f, uid, seen) => run(a, f, async (box, dir) => {
      const m = await get(box, dir, uid)
      if (!m) return null
      m.seen = !!seen
      await modify(box, dir, () => put(box, dir, m))
      return summary(m)
    }),
    updateFlags: (a, f, flags) => run(a, f, async (box, dir) => {
      const byUid = new Map(box.items.map(m => [String(m.uid), m]))
      const changed = flags.filter(v => byUid.has(String(v.uid)) && byUid.get(String(v.uid)).seen !== v.seen)
      if (!changed.length) return
      await modify(box, dir, async () => {
        for (const v of changed) {
          const m = await get(box, dir, v.uid)
          if (m) await put(box, dir, { ...m, seen: v.seen })
        }
      })
    }),
    getSyncState: (a, f) => run(a, f, box => ({ ...box.sync, cached: box.items.filter(m => !m.archived && /^\d+$/.test(String(m.uid))).map(m => Number(m.uid)), warning: box.warning })),
    setSyncState: (a, f, sync) => run(a, f, async (box, dir) => {
      if (box.legacy) throw new Error(box.warning)
      await modify(box, dir, async () => { await atomic(path.join(dir, 'sync.json'), sync); box.sync = sync })
    }),
    archiveEpoch: (a, f, epoch) => run(a, f, (box, dir) => modify(box, dir, async () => {
      for (const item of [...box.items]) {
        if (!/^\d+$/.test(String(item.uid))) continue
        const m = await get(box, dir, item.uid)
        const uid = `archived-${epoch}-${item.uid}`
        await copyAttachments(a, f, f, item.uid, uid)
        await put(box, dir, { ...m, uid, remoteUid: item.uid, archived: true })
        await fs.rm(bodyPath(dir, item.uid), { force: true })
        attachments.deleteForMessages(a, f, [item.uid])
        box.items = box.items.filter(v => String(v.uid) !== String(item.uid))
      }
    })),
    removeMessages: (a, f, uids) => run(a, f, async (box, dir) => {
      const set = new Set(uids.map(String))
      await modify(box, dir, async () => {
        if (box.legacy) box.legacy = box.legacy.filter(m => !set.has(String(m.uid)))
        else for (const uid of set) await fs.rm(bodyPath(dir, uid), { force: true })
        box.items = box.items.filter(m => !set.has(String(m.uid)))
      })
      attachments.deleteForMessages(a, f, uids)
      return { removed: uids.length }
    }),
    clearMessages: (a, f) => run(a, f, async (box, dir) => {
      await modify(box, dir, async () => {
        await fs.rm(path.join(dir, 'bodies'), { recursive: true, force: true })
        await fs.mkdir(path.join(dir, 'bodies'), { recursive: true })
        box.items = []; if (box.legacy) box.legacy = []
      })
      attachments.clearFolderAttachments(a, f)
      return true
    }),
  }
  api.moveMessages = async (a, source, dest, uids, uidMap = {}) => {
    const moved = []
    for (const uid of uids) {
      const m = await api.getMessage(a, source, uid)
      if (!m || uidMap[String(uid)] == null) continue
      const destinationUid = uidMap[String(uid)]
      await copyAttachments(a, source, dest, uid, destinationUid)
      moved.push({ ...m, uid: destinationUid })
    }
    if (moved.length) await api.saveMessages(a, dest, moved)
    await api.removeMessages(a, source, uids)
    return { moved }
  }
  return api
}
module.exports = { createMailboxStore }
