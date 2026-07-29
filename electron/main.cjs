const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const store = require('./mail/store.cjs')
const imap = require('./mail/imap.cjs')
const smtp = require('./mail/smtp.cjs')
const watcher = require('./mail/watcher.cjs')
const updater = require('./updater.cjs')
const { resolveStoreUserDataPath } = require('./user-data.cjs')
const { asFriendlyError, mailErrorInfo, mailSuccessInfo } = require('./mail/errors.cjs')
const { configError, normalizeAccountInput, validAccountId } = require('./mail/validation.cjs')
const { safeExternalUrl } = require('./mail/links.cjs')

const isDev = !app.isPackaged
const APP_NAME = 'Webison Mailer'
const WINDOWS_APP_ID = 'it.webison.mailer'
const WINDOWS_TOAST_ACTIVATOR = '{8D80E9F3-7F8C-4C7B-A2A6-3A7F46D8B8E1}'
let mainWindow

app.setName(APP_NAME)
const renamedUserDataPath = app.getPath('userData')
const canonicalUserDataPath = path.join(app.getPath('appData'), 'webison-mailer')
fs.mkdirSync(canonicalUserDataPath, { recursive: true })
app.setPath('userData', canonicalUserDataPath)
if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_ID)
  if (typeof app.setToastActivatorCLSID === 'function') {
    app.setToastActivatorCLSID(WINDOWS_TOAST_ACTIVATOR)
  }
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('Richiesta IPC non autorizzata')
    }
    return handler(event, ...args)
  })
}

function mailContext(service, account, phase) {
  const prefix = service.toLowerCase()
  return {
    service,
    host: account[`${prefix}Host`],
    port: account[`${prefix}Port`],
    secure: account[`${prefix}Secure`],
    phase,
  }
}

async function runMailOperation(context, operation) {
  try {
    return await operation()
  } catch (err) {
    throw asFriendlyError(err, context)
  }
}

function openExternalUrl(value) {
  const url = safeExternalUrl(value)
  if (!url) return false
  shell.openExternal(url).catch(() => {})
  return true
}

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
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
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
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) {
      if (mainWindow.webContents.getURL()) event.preventDefault()
      return
    }
    event.preventDefault()
    openExternalUrl(event.url)
  })
  mainWindow.webContents.on('will-navigate', (event) => {
    if (mainWindow.webContents.getURL()) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
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

function getAccountOrThrow(accountId) {
  const id = validAccountId(accountId)
  const account = store.getAccount(id)
  if (!account) throw new Error('Account non trovato')
  return account
}

app.whenReady().then(() => {
  const storeUserDataPath = resolveStoreUserDataPath(canonicalUserDataPath, [renamedUserDataPath])
  store.init(storeUserDataPath)
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

handle('app:version', () => app.getVersion())
handle('update:install', () => {
  updater.installUpdate()
  return true
})
handle('update:check', async () => {
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

handle('accounts:list', () => store.listAccounts().map(publicAccount))

handle('accounts:save', (_e, input) => {
  const valid = normalizeAccountInput(input)
  const existing = valid.id ? store.getAccount(valid.id) : null
  if (valid.id && !existing) throw configError('account da modificare non trovato')
  const account = {
    ...valid,
    id: valid.id || randomUUID(),
    passwordEnc: valid.password
      ? encrypt(valid.password)
      : existing?.passwordEnc || '',
  }
  delete account.password
  if (!account.passwordEnc) throw configError('Password è un campo obbligatorio')
  store.saveAccount(account)
  return publicAccount(account)
})

handle('accounts:delete', (_e, id) => {
  const safeId = validAccountId(id)
  if (!store.getAccount(safeId)) throw configError('account non trovato')
  store.deleteAccount(safeId)
  return true
})

handle('accounts:test', async (_e, input) => {
  let valid
  let full
  try {
    valid = normalizeAccountInput(input, { requireIdentity: false })
    const existing = valid.id ? store.getAccount(valid.id) : null
    if (valid.id && !existing) throw configError('account da verificare non trovato')
    const password = valid.password || (existing ? decrypt(existing.passwordEnc) : '')
    if (!password) throw configError('Password è un campo obbligatorio')
    full = {
      ...existing,
      ...valid,
      name: valid.name || existing?.name || valid.username,
      email: valid.email || existing?.email || valid.username,
      password,
    }
  } catch (err) {
    const fallback = {
      imapHost: input?.imapHost,
      imapPort: input?.imapPort,
      imapSecure: input?.imapSecure,
      smtpHost: input?.smtpHost,
      smtpPort: input?.smtpPort,
      smtpSecure: input?.smtpSecure,
    }
    return {
      imap: mailErrorInfo(err, mailContext('IMAP', fallback, 'validazione configurazione')),
      smtp: mailErrorInfo(err, mailContext('SMTP', fallback, 'validazione configurazione')),
    }
  }

  const test = async (service, operation) => {
    const context = mailContext(service, full, 'connessione e autenticazione')
    try {
      await operation()
      return mailSuccessInfo(context)
    } catch (err) {
      return mailErrorInfo(err, context)
    }
  }
  const [imapResult, smtpResult] = await Promise.all([
    test('IMAP', () => imap.verify(full)),
    test('SMTP', () => smtp.verify(full)),
  ])
  return { imap: imapResult, smtp: smtpResult }
})

handle('mail:folders', async (_e, accountId) => {
  const account = getAccountOrThrow(accountId)
  return runMailOperation(
    mailContext('IMAP', account, 'caricamento cartelle'),
    () => imap.listFolders(withPassword(account)),
  )
})

handle('mail:sync', async (_e, { accountId, folder, storeAs }) => {
  const account = getAccountOrThrow(accountId)
  const folderPath = folder || 'INBOX'
  const messages = await runMailOperation(
    mailContext('IMAP', account, `sincronizzazione cartella ${folderPath}`),
    () => imap.fetchMessages(withPassword(account), folderPath),
  )
  const key = storeAs || folderPath
  store.saveMessages(accountId, key, messages)
  return store.listMessages(accountId, key)
})

handle('mail:list', (_e, { accountId, folder }) => {
  getAccountOrThrow(accountId)
  return store.listMessages(accountId, folder || 'INBOX')
})

handle('mail:get', (_e, { accountId, folder, uid }) => {
  getAccountOrThrow(accountId)
  return store.getMessage(accountId, folder || 'INBOX', uid)
})

handle('mail:setSeen', async (_e, { accountId, folder, uid, seen }) => {
  const account = getAccountOrThrow(accountId)
  const folderPath = folder || 'INBOX'
  try {
    await imap.setMessageSeen(withPassword(account), folderPath, uid, Boolean(seen))
  } catch {
    // aggiorna comunque la cache locale se IMAP fallisce (es. offline)
  }
  return store.setMessageSeen(accountId, folderPath, uid, Boolean(seen))
})

handle('mail:delete', async (_e, { accountId, folder, storeAs, uids, permanent }) => {
  const account = getAccountOrThrow(accountId)
  const list = (Array.isArray(uids) ? uids : [uids]).filter((u) => u != null)
  if (!list.length) return store.listMessages(accountId, storeAs || folder || 'INBOX')

  const storeKey = storeAs || folder || 'INBOX'
  const remote = list.filter((u) => !String(u).startsWith('local-'))
  let deleteResult = null
  if (remote.length && folder) {
    deleteResult = await runMailOperation(
      mailContext('IMAP', account, 'eliminazione messaggi'),
      () => imap.deleteMessages(withPassword(account), folder, remote, {
        permanent: Boolean(permanent),
      }),
    )
  }
  if (deleteResult?.trashed && deleteResult.trashPath) {
    const cached = store.moveMessages(
      accountId,
      storeKey,
      deleteResult.trashPath,
      list,
      deleteResult.uidMap || {},
    )
    if (cached.moved.length < remote.length) {
      try {
        const trashMessages = await imap.fetchMessages(withPassword(account), deleteResult.trashPath)
        store.saveMessages(accountId, deleteResult.trashPath, trashMessages)
      } catch {
        // Il MOVE è già riuscito: il Cestino verrà sincronizzato quando viene aperto.
      }
    }
    return cached.source
  }
  return store.removeMessages(accountId, storeKey, list)
})

handle('mail:emptyTrash', async (_e, { accountId }) => {
  const account = getAccountOrThrow(accountId)
  const trashPath = await runMailOperation(
    mailContext('IMAP', account, 'svuotamento cestino'),
    () => imap.emptyTrash(withPassword(account)),
  )
  store.clearMessages(accountId, trashPath)
  return { trashPath }
})

handle('mail:markAllInboxRead', async () => {
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

handle('mail:send', async (_e, { accountId, to, cc, subject, text, html, inReplyTo, references }) => {
  const account = getAccountOrThrow(accountId)
  const full = withPassword(account)
  const info = await runMailOperation(
    mailContext('SMTP', account, 'invio messaggio'),
    () => smtp.send(full, { to, cc, subject, text, html, inReplyTo, references }),
  )

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
    references: references || [],
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
      inReplyTo,
      references,
    })
  } catch {
    // l'invio è già riuscito; APPEND IMAP non deve farlo fallire
  }

  return { messageId: info.messageId, accepted: info.accepted, sentFolder: 'Sent' }
})

handle('contacts:list', () => store.listContacts())
handle('contacts:save', (_e, input) => store.saveContact(input))
handle('contacts:delete', (_e, id) => store.deleteContact(id))

handle('signatures:list', () => store.listSignatures())
handle('signatures:save', (_e, input) => store.saveSignature(input))
handle('signatures:delete', (_e, id) => store.deleteSignature(id))

handle('settings:get', () => store.getSettings())
handle('settings:set', (_e, patch) => {
  const settings = store.saveSettings(patch)
  applyTitleBarTheme(settings.theme)
  watcher.restartMailWatcher()
  return settings
})

handle('shell:openExternal', (_e, value) => {
  return openExternalUrl(value)
})
