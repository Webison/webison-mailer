const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  hasMeaningfulStoreData,
  resolveStoreUserDataPath,
} = require('../electron/user-data.cjs')

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'webison-data-migration-'))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value), 'utf8')
}

function createScaffold(userDataPath) {
  const root = path.join(userDataPath, 'webison-data')
  writeJson(path.join(root, 'accounts.json'), [])
  writeJson(path.join(root, 'contacts.json'), [])
  writeJson(path.join(root, 'signatures.json'), [])
  writeJson(path.join(root, 'settings.json'), {
    theme: 'light',
    colorPreset: 'blu',
    notificationsEnabled: true,
    pollIntervalSec: 60,
  })
  fs.mkdirSync(path.join(root, 'mail'), { recursive: true })
}

test('migra atomicamente i dati storici quando la nuova cartella è vuota', (t) => {
  const temp = makeTempRoot()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const legacy = path.join(temp, 'webison-mailer')
  const current = path.join(temp, 'Webison Mailer')
  createScaffold(current)
  createScaffold(legacy)
  writeJson(path.join(legacy, 'webison-data', 'accounts.json'), [{ id: 'account-1' }])

  assert.equal(resolveStoreUserDataPath(current, [legacy]), current)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(current, 'webison-data', 'accounts.json'), 'utf8')),
    [{ id: 'account-1' }],
  )
  assert.equal(hasMeaningfulStoreData(current), true)
  assert.equal(
    fs.readdirSync(current).some((name) => name.startsWith('webison-data.pre-1.5.1')),
    true,
  )
})

test('non sovrascrive dati già creati nella nuova cartella', (t) => {
  const temp = makeTempRoot()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const legacy = path.join(temp, 'webison-mailer')
  const current = path.join(temp, 'Webison Mailer')
  createScaffold(current)
  createScaffold(legacy)
  writeJson(path.join(current, 'webison-data', 'accounts.json'), [{ id: 'new-account' }])
  writeJson(path.join(legacy, 'webison-data', 'accounts.json'), [{ id: 'old-account' }])

  assert.equal(resolveStoreUserDataPath(current, [legacy]), current)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(current, 'webison-data', 'accounts.json'), 'utf8')),
    [{ id: 'new-account' }],
  )
})

test('migra account e posta conservando le preferenze cambiate nella nuova versione', (t) => {
  const temp = makeTempRoot()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const legacy = path.join(temp, 'webison-mailer')
  const current = path.join(temp, 'Webison Mailer')
  createScaffold(current)
  createScaffold(legacy)
  writeJson(path.join(legacy, 'webison-data', 'accounts.json'), [{ id: 'old-account' }])
  writeJson(path.join(legacy, 'webison-data', 'settings.json'), {
    theme: 'light',
    colorPreset: 'blu',
    notificationsEnabled: true,
    pollIntervalSec: 60,
  })
  writeJson(path.join(current, 'webison-data', 'settings.json'), {
    theme: 'dark',
    colorPreset: 'viola',
    notificationsEnabled: true,
    pollIntervalSec: 120,
  })

  assert.equal(resolveStoreUserDataPath(current, [legacy]), current)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(current, 'webison-data', 'accounts.json'), 'utf8')),
    [{ id: 'old-account' }],
  )
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(current, 'webison-data', 'settings.json'), 'utf8')),
    {
      theme: 'dark',
      colorPreset: 'viola',
      notificationsEnabled: true,
      pollIntervalSec: 120,
    },
  )
})

test('usa la cartella storica come fallback se la migrazione non può essere eseguita', (t) => {
  const temp = makeTempRoot()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const legacy = path.join(temp, 'webison-mailer')
  const blockedCurrent = path.join(temp, 'blocked')
  createScaffold(legacy)
  writeJson(path.join(legacy, 'webison-data', 'accounts.json'), [{ id: 'account-1' }])
  fs.writeFileSync(blockedCurrent, 'non è una directory', 'utf8')

  assert.equal(resolveStoreUserDataPath(blockedCurrent, [legacy]), legacy)
})
