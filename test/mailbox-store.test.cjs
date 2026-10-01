const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { performance } = require('perf_hooks')
const { createMailboxStore } = require('../electron/mail/mailbox-store.cjs')
const attachments = { moveForMessage() {}, deleteForMessages() {}, clearFolderAttachments() {} }
async function fixture(t, io = fs) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mailer-store-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'inbox')
  const make = () => createMailboxStore(() => dir, attachments, io)
  return { dir, make, store: make() }
}
const message = uid => ({ uid, date: uid, subject: `Mail ${uid}`, text: 'Testo completo', html: '<p>Testo</p>', seen: false, attachments: [] })

test('converte lo storico mantenendo originale, UID locali e metadati', async t => {
  const { dir, store, make } = await fixture(t)
  await fs.mkdir(dir)
  const legacy = [message(1), { ...message('local-123'), attachments: [{ id: 'a', stored: true }] }]
  await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(legacy))
  const page = await store.listMessages('a', 'INBOX')
  assert.equal(page.total, 2)
  assert.equal(page.items[0].text, undefined)
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'messages.json'))), legacy)
  assert.deepEqual(await make().getMessage('a', 'INBOX', 'local-123'), legacy[1])
  await store.setMessageSeen('a', 'INBOX', 1, true)
  assert.equal((await make().getMessage('a', 'INBOX', 1)).seen, true)
})

test('conversione interrotta: fallback leggibile e retry senza perdere mail', async t => {
  let fail = true
  const io = { ...fs, writeFile: async (file, ...args) => {
    if (fail && file.includes('format.json')) throw new Error('Disco pieno')
    return fs.writeFile(file, ...args)
  } }
  const { dir, store, make } = await fixture(t, io)
  await fs.mkdir(dir)
  await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify([message(1)]))
  const page = await store.listMessages('a', 'INBOX')
  assert.match(page.warning, /Disco pieno/)
  assert.equal((await store.getMessage('a', 'INBOX', 1)).text, 'Testo completo')
  fail = false
  assert.equal((await make().listMessages('a', 'INBOX')).total, 1)
})

test('ricostruisce indice sporco o corrotto dai corpi e conserva il cursore', async t => {
  const { dir, store, make } = await fixture(t)
  await store.saveMessages('a', 'INBOX', [message(1), message(2)])
  await store.setSyncState('a', 'INBOX', { lastUid: 2, uidValidity: '10', initialized: true })
  await fs.writeFile(path.join(dir, 'dirty.json'), '{}')
  await fs.writeFile(path.join(dir, 'index.json'), 'broken')
  const recovered = make()
  assert.equal((await recovered.listMessages('a', 'INBOX')).total, 2)
  assert.equal((await recovered.getSyncState('a', 'INBOX')).lastUid, 2)
})

test('scritture concorrenti, filtri e cursore non perdono dati', async t => {
  const { store } = await fixture(t)
  await Promise.all(Array.from({ length: 110 }, (_, uid) => store.saveMessages('a', 'INBOX', [message(uid + 1)])))
  const first = await store.listMessages('a', 'INBOX')
  assert.equal(first.items.length, 100)
  await store.saveMessages('a', 'INBOX', [message(111)])
  const second = await store.listMessages('a', 'INBOX', { cursor: first.nextCursor })
  assert.equal(second.items.length, 10)
  assert.equal(new Set([...first.items, ...second.items].map(m => m.uid)).size, 110)
  await store.setMessageSeen('a', 'INBOX', 1, true)
  assert.equal((await store.listMessages('a', 'INBOX', { filter: 'read' })).total, 1)
})

test('cambio UIDVALIDITY conserva vecchie mail e distingue UID riutilizzati', async t => {
  const { store } = await fixture(t)
  await store.saveMessages('a', 'INBOX', [message(1), message('local-1')])
  await store.archiveEpoch('a', 'INBOX', '10')
  await store.saveMessages('a', 'INBOX', [{ ...message(1), subject: 'Nuova epoca' }])
  assert.equal((await store.getMessage('a', 'INBOX', 'archived-10-1')).subject, 'Mail 1')
  assert.equal((await store.getMessage('a', 'INBOX', 1)).subject, 'Nuova epoca')
  assert.ok(await store.getMessage('a', 'INBOX', 'local-1'))
  assert.deepEqual((await store.getSyncState('a', 'INBOX')).cached, [1])
})

for (const count of [500, 5000]) {
  test(`archivio di ${count} mail: lista senza corpi e selezione con una sola lettura`, async t => {
    let bodyReads = 0
    const io = { ...fs, readFile: async (file, ...args) => {
      if (file.includes(`${path.sep}bodies${path.sep}`)) bodyReads++
      return fs.readFile(file, ...args)
    } }
    const { store } = await fixture(t, io)
    await store.saveMessages('a', 'INBOX', Array.from({ length: count }, (_, i) => ({ ...message(i + 1), text: 'contenuto '.repeat(1000) })))
    bodyReads = 0
    const start = performance.now()
    const page = await store.listMessages('a', 'INBOX')
    assert.equal(page.total, count)
    assert.equal(page.items.length, 100)
    assert.equal(bodyReads, 0)
    assert.ok(JSON.stringify(page).length < 100000)
    await store.getMessage('a', 'INBOX', 1)
    assert.equal(bodyReads, 1)
    const elapsed = performance.now() - start
    t.diagnostic(`Lista e apertura locale: ${elapsed.toFixed(1)} ms`)
    assert.ok(elapsed < 1000)
  })
}
