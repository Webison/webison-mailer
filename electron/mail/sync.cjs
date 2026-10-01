const store = require('./store.cjs')
const imap = require('./imap.cjs')

function createSyncService({ storage = store, transport = imap, onSaved = () => {} } = {}) {
  const pending = new Map()
  const waiting = []
  let active = 0
  let listener = onSaved
  async function acquire() {
    if (active < 2) { active++; return }
    await new Promise(resolve => waiting.push(resolve))
  }
  function release() {
    const next = waiting.shift()
    if (next) next(); else active--
  }
  function sync(account, folder = 'INBOX', storeAs = folder) {
    const key = JSON.stringify([account.id, folder, storeAs])
    if (pending.has(key)) return pending.get(key)
    const promise = (async () => {
      await acquire()
      try {
        return await transport.withClient(account, async client => {
          const lock = await client.getMailboxLock(folder)
          try {
            let state = await storage.getSyncState(account.id, storeAs)
            if (state.warning) throw new Error(state.warning)
            const epoch = String(client.mailbox.uidValidity)
            if (state.uidValidity && state.uidValidity !== epoch) {
              await storage.archiveEpoch(account.id, storeAs, state.uidValidity)
              state = { cached: [], initialized: false }
              await storage.setSyncState(account.id, storeAs, { uidValidity: epoch, lastUid: 0, initialized: false })
            }
            const baseline = !state.initialized
            const total = client.mailbox.exists || 0
            const headers = []
            if (total) {
              const range = baseline ? `${Math.max(1, total - 49)}:*` : `${Number(state.lastUid || 0) + 1}:*`
              for await (const m of client.fetch(range, { uid: true, flags: true }, { uid: !baseline })) {
                // IMAP n:* can return the last message even when n exceeds UIDNEXT.
                if (baseline || m.uid > Number(state.lastUid || 0)) headers.push(m)
              }
            }
            const cached = new Set(state.cached || [])
            const missing = headers.filter(m => !cached.has(m.uid)).map(m => m.uid).sort((a, b) => a - b)
            let lastUid = Number(state.lastUid || 0)
            let downloaded = 0
            for (let start = 0; start < missing.length; start += 50) {
              const uids = missing.slice(start, start + 50)
              const saved = await transport.fetchMessagesWithClient(client, account, folder, 50, {
                accountId: account.id, storeAs, uids,
                saveMessage: async message => {
                  await storage.saveMessages(account.id, storeAs, [message])
                  downloaded++
                  // Failures in notification delivery never undo a durable save.
                  try { listener({ accountId: account.id, folder: storeAs, message, notify: false }) }
                  catch { /* next UI refresh reads the saved message */ }
                },
              })
              if (saved.length) lastUid = Math.max(lastUid, ...saved.map(m => m.uid))
              // Keep initialization false until the whole initial window is saved.
              await storage.setSyncState(account.id, storeAs, { uidValidity: epoch, lastUid, initialized: !baseline })
              try { listener({ accountId: account.id, folder: storeAs, messages: saved, notify: !baseline }) } catch {}
            }
            // Known messages require only UID/flags, never source or attachments.
            const flags = headers.map(m => ({ uid: m.uid, seen: m.flags?.has('\\Seen') || false }))
            const known = [...cached]
            for (let start = 0; start < known.length; start += 200) {
              for await (const m of client.fetch(known.slice(start, start + 200).join(','), { uid: true, flags: true }, { uid: true })) {
                flags.push({ uid: m.uid, seen: m.flags?.has('\\Seen') || false })
              }
            }
            await storage.updateFlags(account.id, storeAs, flags)
            lastUid = Math.max(lastUid, ...headers.map(m => m.uid), 0)
            await storage.setSyncState(account.id, storeAs, { uidValidity: epoch, lastUid, initialized: true })
            try { listener({ accountId: account.id, folder: storeAs, notify: false }) } catch {}
            return { downloaded, initialized: true }
          } finally { lock.release() }
        })
      } finally { release() }
    })().finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
  return { sync, setListener: callback => { listener = callback } }
}
module.exports = { createSyncService, ...createSyncService() }
