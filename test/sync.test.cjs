const test = require('node:test')
const assert = require('node:assert/strict')
const { createSyncService } = require('../electron/mail/sync.cjs')
const { fetchMessagesWithClient } = require('../electron/mail/imap.cjs')

function fixture({ initialized = true, count = 120 } = {}) {
  let state = { initialized, uidValidity: '10', lastUid: 1 }
  const saved = new Map([[1, { uid: 1, seen: false }]])
  const bodies = [], events = [], queries = []
  const storage = {
    getSyncState: async () => ({ ...state, cached: [...saved.keys()] }),
    setSyncState: async (_a, _f, next) => { state = next },
    saveMessages: async (_a, _f, messages) => { for (const m of messages) saved.set(m.uid, m) },
    updateFlags: async (_a, _f, flags) => { for (const m of flags) if (saved.has(m.uid)) saved.get(m.uid).seen = m.seen },
    archiveEpoch: async () => { saved.clear() },
  }
  const client = {
    mailbox: { uidValidity: 10n, exists: count }, getMailboxLock: async () => ({ release() {} }),
    async *fetch(range, fields, opts) {
      queries.push({ range, fields, opts })
      const uids = range.includes(':') ? Array.from({ length: count }, (_, i) => i + 1).filter(uid => uid >= Number(range.split(':')[0])) : range.split(',').map(Number)
      for (const uid of uids) if (uid <= count) yield { uid, flags: new Set(uid === 1 ? ['\\Seen'] : []) }
    },
  }
  const transport = {
    withClient: async (_a, fn) => fn(client),
    fetchMessagesWithClient: async (_c, _a, _f, _limit, opts) => {
      bodies.push(...opts.uids)
      const messages = opts.uids.map(uid => ({ uid, date: uid, seen: false }))
      for (const m of messages) await opts.saveMessage(m)
      return messages
    },
  }
  const service = createSyncService({ storage, transport, onSaved: event => {
    if (event.message) assert.ok(saved.has(event.message.uid), 'notifica dopo salvataggio')
    if (event.messages) for (const message of event.messages) assert.ok(saved.has(message.uid), 'notifica dopo salvataggio')
    events.push(event)
  } })
  return { storage, service, saved, bodies, events, queries, client, transport, state: () => state }
}

test('scarica oltre 50 novità in lotti, notifica solo dopo salvataggio e aggiorna flags', async () => {
  const f = fixture()
  const result = await f.service.sync({ id: 'a' })
  assert.equal(result.downloaded, 119)
  assert.equal(f.bodies.includes(1), false)
  assert.equal(f.saved.get(1).seen, true)
  assert.equal(f.events.filter(e => e.notify).flatMap(e => e.messages).length, 119)
  assert.equal(f.state().lastUid, 120)
  await f.service.sync({ id: 'a' })
  assert.equal(f.bodies.length, 119)
  assert.ok(f.queries.every(q => !q.fields.source))
})

test('prima sincronizzazione mantiene finestra di 50 e baseline silenziosa', async () => {
  const f = fixture({ initialized: false })
  await f.service.sync({ id: 'a' })
  assert.equal(f.bodies.length, 50)
  assert.equal(f.events.some(e => e.notify), false)
  assert.equal(f.state().initialized, true)
})

test('errore di salvataggio non avanza il cursore e la richiesta può essere ripetuta', async () => {
  const f = fixture({ count: 3 })
  const save = f.storage.saveMessages
  f.storage.saveMessages = async () => { throw new Error('Disco pieno') }
  await assert.rejects(f.service.sync({ id: 'a' }), /Disco pieno/)
  assert.equal(f.state().lastUid, 1)
  assert.equal(f.events.length, 0)
  f.storage.saveMessages = save
  await f.service.sync({ id: 'a' })
  assert.equal(f.state().lastUid, 3)
})

test('deduplica richieste e limita a due le sincronizzazioni concorrenti', async () => {
  const f = fixture({ count: 0 })
  let active = 0, maximum = 0, calls = 0
  f.transport.withClient = async (_a, fn) => {
    calls++; active++; maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 20))
    try { return await fn(f.client) } finally { active-- }
  }
  const first = f.service.sync({ id: 'a' })
  assert.equal(first, f.service.sync({ id: 'a' }))
  await Promise.all([first, f.service.sync({ id: 'b' }), f.service.sync({ id: 'c' })])
  assert.equal(calls, 3)
  assert.equal(maximum, 2)
})

test('UIDVALIDITY cambiata archivia prima di riutilizzare UID', async () => {
  const f = fixture({ count: 2 })
  f.client.mailbox.uidValidity = 20n
  await f.service.sync({ id: 'a' })
  assert.deepEqual(f.bodies, [1, 2])
  assert.equal(f.state().uidValidity, '20')
  assert.equal(f.events.some(e => e.notify), false)
})

test('non elimina dal server se il salvataggio del corpo fallisce', async () => {
  const deletions = []
  const client = { mailbox: { exists: 1 },
    async *fetch() { yield { uid: 1, flags: new Set(), source: Buffer.from('Subject: Test\r\n\r\nCorpo') } },
    messageDelete: async uids => deletions.push(uids),
  }
  await assert.rejects(fetchMessagesWithClient(client, { leaveOnServer: false }, 'INBOX', 50, {
    uids: [1], saveMessage: async () => { throw new Error('Disco pieno') },
  }), /Disco pieno/)
  assert.deepEqual(deletions, [])
  await fetchMessagesWithClient(client, { leaveOnServer: false }, 'INBOX', 50, { uids: [1], saveMessage: async () => {} })
  assert.deepEqual(deletions, ['1'])
})
