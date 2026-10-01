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
    bodyReads = 0
    assert.equal((await store.listMessages('a', 'INBOX', { query: 'contenuto' })).total, count)
    assert.equal(bodyReads, count)
    bodyReads = 0
    const searchStart = performance.now()
    assert.equal((await store.listMessages('a', 'INBOX', { query: 'CONTENÚTO mail', cursor: page.nextCursor })).items.length, 100)
    assert.equal(bodyReads, 0)
    t.diagnostic(`Ricerca con cache: ${(performance.now() - searchStart).toFixed(1)} ms`)
  })
}

test('ricerca in tutti i campi e nel corpo completo, normalizzazione e HTML visibile', async t => {
  const { store } = await fixture(t)
  await store.saveMessages('a', 'INBOX', [
    { ...message(1), subject: 'Fattura caffè', from: 'mario@example.test', to: 'cliente@example.test', cc: 'contabile@example.test', text: 'x'.repeat(300) + ' pagamento finale' },
    { ...message(2), text: '', html: '<style>segretoStyle</style><script>segretoScript</script><p title="segretoAttributo">caff&egrave; &amp; latte &#233;</p><a href="https://segretoLink.test">Visibile</a><img alt="segretoImmagine" src="segretoSrc">' },
    { ...message(3), text: 'solo testo', html: '<p>alternativaHtml</p>' },
  ])
  const search = async query => (await store.listMessages('a', 'INBOX', { query })).items.map(m => m.uid)
  for (const query of ['FATTURA', 'mario@', 'cliente@', 'contabile@', 'finale', '  FATTURA   MÁRIO finale  ']) {
    assert.deepEqual(await search(query), [1])
  }
  assert.deepEqual(await search('caffe latte & e'), [2])
  assert.deepEqual(await search('visibile'), [2])
  for (const query of ['segretoStyle', 'segretoScript', 'segretoAttributo', 'segretoLink', 'segretoImmagine', 'segretoSrc', 'alternativaHtml', 'inesistente']) {
    assert.deepEqual(await search(query), [])
  }
  assert.equal((await store.listMessages('a', 'INBOX', { query: ' \t ' })).total, 3)
  assert.equal((await store.listMessages('a', 'INBOX', { query: 'finale' })).items[0].text, undefined)
})

test('ricerca e filtri precedono la paginazione e preservano il totale cartella', async t => {
  const { store } = await fixture(t)
  await store.saveMessages('a', 'INBOX', Array.from({ length: 220 }, (_, i) => ({ ...message(i + 1), seen: i >= 110, text: 'corrispondenza' })))
  await store.saveMessages('a', 'INBOX', [{ ...message(221), text: 'esclusa' }])
  const first = await store.listMessages('a', 'INBOX', { query: 'corrispondenza', filter: 'read' })
  assert.equal(first.total, 110)
  assert.equal(first.folderTotal, 221)
  assert.equal(first.items.length, 100)
  const next = await store.listMessages('a', 'INBOX', { query: 'corrispondenza', filter: 'read', cursor: first.nextCursor })
  assert.equal(next.items.length, 10)
  assert.equal(next.nextCursor, null)
  assert.equal(new Set([...first.items, ...next.items].map(m => m.uid)).size, 110)
  assert.equal((await store.listMessages('a', 'INBOX', { query: 'corrispondenza', filter: 'unread' })).total, 110)
})

test('cache isolata per account/cartella, aggiornata dopo modifiche, spostamenti e reset', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mailer-search-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const make = () => createMailboxStore((a, f) => path.join(root, a, f), attachments)
  const store = make()
  const count = async (a, f, query) => (await store.listMessages(a, f, { query })).total
  await store.saveMessages('a', 'INBOX', [{ ...message(1), text: 'originale' }])
  await store.saveMessages('b', 'INBOX', [{ ...message(1), text: 'altroaccount' }])
  await store.saveMessages('a', 'Sent', [{ ...message(1), text: 'altracartella' }])
  assert.equal(await count('a', 'INBOX', 'originale'), 1)
  assert.equal(await count('b', 'INBOX', 'originale'), 0)
  assert.equal(await count('a', 'Sent', 'originale'), 0)
  await store.saveMessages('a', 'INBOX', [{ ...message(1), text: 'aggiornato' }])
  assert.equal(await count('a', 'INBOX', 'originale'), 0)
  assert.equal(await count('a', 'INBOX', 'aggiornato'), 1)
  await store.moveMessages('a', 'INBOX', 'Sent', [1], { 1: 2 })
  assert.equal(await count('a', 'INBOX', 'aggiornato'), 0)
  assert.equal(await count('a', 'Sent', 'aggiornato'), 1)
  await store.archiveEpoch('a', 'Sent', '10')
  assert.match((await store.listMessages('a', 'Sent', { query: 'aggiornato' })).items[0].uid, /^archived-/)
  store.reset()
  assert.equal(await count('a', 'Sent', 'aggiornato'), 1)
  assert.equal((await make().listMessages('a', 'Sent', { query: 'aggiornato' })).total, 1)
  await store.removeMessages('a', 'Sent', ['archived-10-2'])
  assert.equal(await count('a', 'Sent', 'aggiornato'), 0)
  await store.clearMessages('a', 'Sent')
  assert.equal(await count('a', 'Sent', 'altracartella'), 0)
})

test('ricerca nell’archivio legacy anche quando la conversione fallisce', async t => {
  const io = { ...fs, writeFile: async (file, ...args) => {
    if (file.includes('format.json')) throw new Error('Conversione bloccata')
    return fs.writeFile(file, ...args)
  } }
  const { dir, store, make } = await fixture(t, io)
  await fs.mkdir(dir)
  await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify([{ ...message(1), text: 'storico ricercabile' }]))
  assert.equal((await store.listMessages('a', 'INBOX', { query: 'storico' })).total, 1)
  assert.equal((await make().listMessages('a', 'INBOX', { query: 'ricercabile' })).total, 1)
})
