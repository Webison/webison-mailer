// Run with npm run test:electron. Uses only synthetic mail in a temporary profile.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const store = require('../electron/mail/store.cjs')

let root = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'mailer-electron-')), win
app.setPath('userData', root)
app.disableHardwareAcceleration()
const accountId = '26b52818-ab6e-4a68-a9b0-7c3c3e4dec47'
const errors = []
async function waitFor(predicate, timeout = 5000) {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    if (await win.webContents.executeJavaScript(predicate)) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timeout: ${predicate}`)
}
app.whenReady().then(async () => {
  store.init(root)
  store.saveAccount({ id: accountId, email: 'test@example.test', name: 'Test' })
  await store.saveMessages(accountId, 'INBOX', Array.from({ length: 5000 }, (_, i) => ({
    uid: i + 1, date: i + 1, subject: `Messaggio ${i + 1}`, from: 'mittente@example.test',
    seen: i % 2 === 1, text: `Corpo locale ${i + 1}`, html: '', attachments: [],
  })))
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('accounts:list', () => store.listAccounts())
  ipcMain.handle('contacts:list', () => [])
  ipcMain.handle('signatures:list', () => [])
  ipcMain.handle('app:version', () => '2.0.0')
  // Deliberately unresolved: neither the initial list nor notifications may await network.
  ipcMain.handle('mail:folders', () => new Promise(() => {}))
  ipcMain.handle('mail:sync', () => new Promise(() => {}))
  ipcMain.handle('mail:list', (_event, { accountId, folder, filter, cursor }) => store.listMessages(accountId, folder, { filter, cursor }))
  ipcMain.handle('mail:get', (_event, { accountId, folder, uid }) => store.getMessage(accountId, folder, uid))
  ipcMain.handle('mail:setSeen', (_event, { accountId, folder, uid, seen }) => store.setMessageSeen(accountId, folder, uid, seen))
  win = new BrowserWindow({ show: false, width: 1280, height: 900,
    webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadFile(path.resolve(__dirname, '../dist/index.html'))
  await waitFor("document.querySelectorAll('.virtual-message-row').length > 0")
  assert.ok(await win.webContents.executeJavaScript("document.querySelectorAll('.virtual-message-row').length < 30"))
  // Scroll through multiple pages; DOM size stays bounded.
  for (let i = 0; i < 3; i++) {
    await win.webContents.executeJavaScript("document.querySelector('.message-list').scrollTop = document.querySelector('.message-list').scrollHeight")
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  assert.ok(await win.webContents.executeJavaScript("document.querySelectorAll('.virtual-message-row').length < 30"))
  await win.webContents.executeJavaScript("[...document.querySelectorAll('.filter-seg button')].find(b => b.textContent.trim() === 'Lette').click()")
  await new Promise(resolve => setTimeout(resolve, 100))
  const start = performance.now()
  win.webContents.send('mail:new', { accountId, folder: 'INBOX', uid: 1, open: true })
  await waitFor("document.querySelector('.reader-header')?.textContent.includes('Messaggio 1')")
  const elapsed = performance.now() - start
  assert.ok(elapsed < 1000, `Apertura notifica: ${elapsed.toFixed(1)} ms`)
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.deepEqual(errors, [])
  console.log(`Electron OK: 5.000 mail, DOM limitato, notifica fuori pagina/filtro ${elapsed.toFixed(1)} ms, rete bloccata.`)
}).catch(err => { console.error(err); process.exitCode = 1 }).finally(async () => {
  win?.destroy()
  if (root) await fs.rm(root, { recursive: true, force: true })
  app.exit(process.exitCode || 0)
})
