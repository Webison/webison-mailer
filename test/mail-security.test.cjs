const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { classifyCode, mailErrorInfo, mailSuccessInfo } = require('../electron/mail/errors.cjs')
const { normalizeAccountInput, validAccountId } = require('../electron/mail/validation.cjs')
const { safeExternalUrl } = require('../electron/mail/links.cjs')
const { deleteMessagesWithClient } = require('../electron/mail/imap.cjs')
const smtp = require('../electron/mail/smtp.cjs')

const ACCOUNT_ID = '26b52818-ab6e-4a68-a9b0-7c3c3e4dec47'

function context(service = 'SMTP') {
  return {
    service,
    host: service === 'SMTP' ? 'smtps.example.test' : 'imaps.example.test',
    port: service === 'SMTP' ? 465 : 993,
    secure: true,
    phase: 'connessione e autenticazione',
  }
}

test('classifica gli errori di rete e autenticazione', () => {
  assert.equal(classifyCode({ code: 'ENOTFOUND' }), 'DNS_NOT_FOUND')
  assert.equal(classifyCode({ code: 'ECONNREFUSED' }), 'CONNECTION_REFUSED')
  assert.equal(classifyCode({ code: 'ETIMEDOUT' }), 'CONNECTION_TIMEOUT')
  assert.equal(classifyCode(new Error('Greeting never received')), 'GREETING_TIMEOUT')
  assert.equal(classifyCode({ code: 'EAUTH', responseCode: 535 }), 'AUTH_FAILED')
  assert.equal(classifyCode(new Error('self-signed certificate')), 'CERT_INVALID')
  assert.equal(classifyCode(new Error('SSL wrong version number')), 'TLS_ERROR')
})

test('il risultato diagnostico espone solo campi sicuri', () => {
  const err = new Error('Greeting never received for user@example.test password=super-secret')
  err.stack = 'stack con super-secret'
  const result = mailErrorInfo(err, context())
  assert.deepEqual(Object.keys(result).sort(), ['code', 'endpoint', 'message', 'ok', 'tls'])
  assert.equal(result.code, 'GREETING_TIMEOUT')
  assert.equal(result.message.includes('super-secret'), false)
  assert.equal(result.message.includes('user@example.test'), false)
  assert.equal(result.endpoint, 'smtps.example.test:465')

  const success = mailSuccessInfo(context('IMAP'))
  assert.deepEqual(Object.keys(success).sort(), ['code', 'endpoint', 'message', 'ok', 'tls'])
  assert.equal(success.ok, true)
})

test('valida account, host e porte prima di usare la rete', () => {
  assert.equal(validAccountId(ACCOUNT_ID), ACCOUNT_ID)
  assert.throws(() => validAccountId('../../Windows'), /identificativo account non valido/)
  assert.throws(
    () => normalizeAccountInput({
      username: 'user@example.test',
      imapHost: 'imap.example.test',
      imapPort: 70000,
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
    }, { requireIdentity: false }),
    /Porta IMAP/,
  )
})

test('lo store impedisce traversal tramite account e cartella', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webison-mailer-test-'))
  const sentinel = path.join(tempRoot, 'sentinel.txt')
  fs.writeFileSync(sentinel, 'keep')

  const storePath = require.resolve('../electron/mail/store.cjs')
  delete require.cache[storePath]
  const store = require(storePath)
  store.init(tempRoot)

  assert.throws(() => store.deleteAccount('../../'), /identificativo account non valido/)
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep')

  store.saveMessages(ACCOUNT_ID, '..', [{ uid: 1, subject: 'test' }])
  const expected = path.join(tempRoot, 'webison-data', 'mail', ACCOUNT_ID, '_dotdot', 'messages.json')
  assert.equal(fs.existsSync(expected), true)

  store.saveMessages(ACCOUNT_ID, 'INBOX', [{ uid: 10, subject: 'da spostare' }])
  const moved = store.moveMessages(ACCOUNT_ID, 'INBOX', 'Trash', [10], { 10: 99 })
  assert.equal(moved.source.length, 0)
  assert.equal(moved.moved[0].uid, 99)
  assert.equal(store.getMessage(ACCOUNT_ID, 'Trash', 99).subject, 'da spostare')
})

test('il transport SMTP disabilita accesso a file e URL', () => {
  const transporter = smtp.createTransport({
    smtpHost: 'smtp.example.test',
    smtpPort: 465,
    smtpSecure: true,
    username: 'user@example.test',
    password: 'not-used',
  })
  assert.equal(transporter.options.disableFileAccess, true)
  assert.equal(transporter.options.disableUrlAccess, true)
  assert.equal(transporter.options.greetingTimeout, 10000)
  transporter.close()
})

function fakeImapClient({ boxes = [], moveResult = true, deleteResult = true } = {}) {
  return {
    list: async () => boxes,
    getMailboxLock: async () => ({ release() {} }),
    messageMove: async () => moveResult,
    messageDelete: async () => deleteResult,
  }
}

test('sposta nel Cestino solo quando il server conferma il MOVE', async () => {
  const client = fakeImapClient({
    boxes: [{ path: 'Trash', name: 'Trash', specialUse: '\\Trash' }],
    moveResult: { uidMap: new Map([[10, 99]]) },
  })
  const result = await deleteMessagesWithClient(client, 'INBOX', [10])
  assert.equal(result.trashed, true)
  assert.equal(result.trashPath, 'Trash')
  assert.deepEqual(result.uidMap, { 10: 99 })
})

test('non cancella definitivamente se il server non espone un Cestino', async () => {
  const client = fakeImapClient({ boxes: [] })
  await assert.rejects(
    () => deleteMessagesWithClient(client, 'INBOX', [10]),
    /Cestino non trovata/,
  )
})

test('considera un MOVE false come errore e mantiene la cache sorgente', async () => {
  const client = fakeImapClient({
    boxes: [{ path: 'Trash', name: 'Trash', specialUse: '\\Trash' }],
    moveResult: false,
  })
  await assert.rejects(
    () => deleteMessagesWithClient(client, 'INBOX', [10]),
    /non ha confermato lo spostamento/,
  )
})

test('consente la cancellazione permanente solo quando richiesta', async () => {
  const client = fakeImapClient({ deleteResult: true })
  const result = await deleteMessagesWithClient(client, 'Trash', [99], { permanent: true })
  assert.equal(result.permanent, true)
  assert.equal(result.trashed, false)
})

test('consente nel browser solo URL HTTP e HTTPS senza credenziali', () => {
  assert.equal(safeExternalUrl('https://example.com/path'), 'https://example.com/path')
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/')
  assert.equal(safeExternalUrl('https://user:secret@example.com'), null)
  assert.equal(safeExternalUrl('javascript:alert(1)'), null)
  assert.equal(safeExternalUrl('file:///C:/Windows/System32'), null)
  assert.equal(safeExternalUrl('data:text/html,test'), null)
})
