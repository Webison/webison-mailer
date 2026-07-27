const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
const path = require('path')
const { randomUUID } = require('crypto')
const store = require('./mail/store.cjs')
const imap = require('./mail/imap.cjs')
const smtp = require('./mail/smtp.cjs')
const watcher = require('./mail/watcher.cjs')
const updater = require('./updater.cjs')

const isDev = !app.isPackaged
let mainWindow

const THEME_UI = {
  light: { bg: '#f3f3f3', symbol: '#1a1a1a' },
  dark: { bg: '#202020', symbol: '#ffffff' },
}

function applyTitleBarTheme(theme) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const t = THEME_UI[theme] || THEME_UI.light
  mainWindow.setTitleBarOverlay({
    color: t.bg,
    symbolColor: t.symbol,
    height: 40,
  })
  mainWindow.setBackgroundColor(t.bg)
}

function createWindow() {
  const settings = store.getSettings()
  const theme = settings.theme === 'dark' ? 'dark' : 'light'
  const t = THEME_UI[theme]

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Webison Mailer',
    backgroundColor: t.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: t.bg,
      symbolColor: t.symbol,
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function encrypt(text) {
  if (!text) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64')
  }
  return Buffer.from(text, 'utf8').toString('base64')
}

function decrypt(payload) {
  if (!payload) return ''
  const buf = Buffer.from(payload, 'base64')
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      return buf.toString('utf8')
    }
  }
  return buf.toString('utf8')
}

function withPassword(account) {
  return {
    ...account,
    password: decrypt(account.passwordEnc),
  }
}

function publicAccount(account) {
  const { passwordEnc, ...rest } = account
  return rest
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'))
  createWindow()
  watcher.startMailWatcher({
    decrypt: withPassword,
    getWindow: () => mainWindow,
  })
  updater.setupUpdater({
    getMainWindow: () => mainWindow,
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  watcher.stopMailWatcher()
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('update:install', () => {
  updater.installUpdate()
  return true
})
ipcMain.handle('update:check', async () => {
  try {
    const result = await updater.checkForUpdates()
    return {
      ok: true,
      version: result?.updateInfo?.version || null,
    }
  } catch (err) {
    return { ok: false, message: err?.message || String(err) }
  }
})

ipcMain.handle('accounts:list', () => store.listAccounts().map(publicAccount))

ipcMain.handle('accounts:save', (_e, input) => {
  const existing = input.id ? store.getAccount(input.id) : null
  const account = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    email: input.email.trim(),
    imapHost: input.imapHost.trim(),
    imapPort: Number(input.imapPort) || 993,
    imapSecure: input.imapSecure !== false,
    smtpHost: input.smtpHost.trim(),
    smtpPort: Number(input.smtpPort) || 587,
    smtpSecure: Boolean(input.smtpSecure),
    leaveOnServer: input.leaveOnServer !== false,
    signatureId: input.signatureId || null,
    username: (input.username || input.email).trim(),
    passwordEnc: input.password
      ? encrypt(input.password)
      : existing?.passwordEnc || '',
  }
  store.saveAccount(account)
  return publicAccount(account)
})

ipcMain.handle('accounts:delete', (_e, id) => {
  store.deleteAccount(id)
  return true
})

ipcMain.handle('mail:folders', async (_e, accountId) => {
  const account = store.getAccount(accountId)
  if (!account) throw new Error('Account non trovato')
  return imap.listFolders(withPassword(account))
})

ipcMain.handle('mail:sync', async (_e, { accountId, folder, storeAs }) => {
  const account = store.getAccount(accountId)
  if (!account) throw new Error('Account non trovato')
  const folderPath = folder || 'INBOX'
  const messages = await imap.fetchMessages(withPassword(account), folderPath)
  const key = storeAs || folderPath
  store.saveMessages(accountId, key, messages)
  return store.listMessages(accountId, key)
})

ipcMain.handle('mail:list', (_e, { accountId, folder }) => {
  return store.listMessages(accountId, folder || 'INBOX')
})

ipcMain.handle('mail:get', (_e, { accountId, folder, uid }) => {
  return store.getMessage(accountId, folder || 'INBOX', uid)
})

ipcMain.handle('mail:setSeen', async (_e, { accountId, folder, uid, seen }) => {
  const account = store.getAccount(accountId)
  if (!account) throw new Error('Account non trovato')
  const folderPath = folder || 'INBOX'
  try {
    await imap.setMessageSeen(withPassword(account), folderPath, uid, Boolean(seen))
  } catch {
    // aggiorna comunque la cache locale se IMAP fallisce (es. offline)
  }
  return store.setMessageSeen(accountId, folderPath, uid, Boolean(seen))
})

ipcMain.handle('mail:markAllInboxRead', async () => {
  const accounts = store.listAccounts()
  for (const account of accounts) {
    try {
      const folders = await imap.listFolders(withPassword(account))
      const inbox =
        folders.find((f) => f.specialUse === '\\Inbox') ||
        folders.find((f) => String(f.path || '').toUpperCase() === 'INBOX') ||
        { path: 'INBOX' }

      const inboxPath = inbox.path || 'INBOX'
      await imap.markAllMessagesSeen(withPassword(account), inboxPath, true)
      store.clearMessages(account.id, inboxPath)
    } catch {
      // se un account fallisce non bloccare gli altri
    }
  }
  return true
})

ipcMain.handle('mail:send', async (_e, { accountId, to, cc, subject, text, html, inReplyTo, references }) => {
  const account = store.getAccount(accountId)
  if (!account) throw new Error('Account non trovato')
  const full = withPassword(account)
  const info = await smtp.send(full, { to, cc, subject, text, html, inReplyTo, references })

  const localUid = `local-${Date.now()}`
  const sentMessage = {
    uid: localUid,
    subject: subject || '(senza oggetto)',
    from: account.email,
    to: to || '',
    date: Date.now(),
    seen: true,
    text: text || '',
    html: html || '',
    messageId: info.messageId || null,
    inReplyTo: inReplyTo || null,
  }
  store.saveMessages(accountId, 'Sent', [sentMessage])

  try {
    await imap.appendToSent(full, {
      from: `"${account.name}" <${account.email}>`,
      to,
      cc,
      subject,
      text,
      html,
      messageId: info.messageId,
    })
  } catch {
    // l'invio è già riuscito; APPEND IMAP non deve farlo fallire
  }

  return { messageId: info.messageId, accepted: info.accepted, sentFolder: 'Sent' }
})

ipcMain.handle('contacts:list', () => store.listContacts())
ipcMain.handle('contacts:save', (_e, input) => store.saveContact(input))
ipcMain.handle('contacts:delete', (_e, id) => store.deleteContact(id))

ipcMain.handle('signatures:list', () => store.listSignatures())
ipcMain.handle('signatures:save', (_e, input) => store.saveSignature(input))
ipcMain.handle('signatures:delete', (_e, id) => store.deleteSignature(id))

ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:set', (_e, patch) => {
  const settings = store.saveSettings(patch)
  applyTitleBarTheme(settings.theme)
  watcher.restartMailWatcher()
  return settings
})

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
})
