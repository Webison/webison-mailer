const { Notification } = require('electron')
const store = require('./store.cjs')
const syncService = require('./sync.cjs')
const { mailErrorInfo } = require('./errors.cjs')
const { sendMailNewWhenReady } = require('./notification-target.cjs')

let timer = null
let startupTimer = null
let running = false
let decryptAccount = null
let getMainWindow = null
const lastDiagnostics = new Map()
const rendererTimers = new Map()

function truncate(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function notifyRenderer(payload) {
  sendMailNewWhenReady(getMainWindow?.(), payload)
}

function showNotification({ title, body, accountId, folder = 'INBOX', uid }) {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title,
    body,
    silent: false,
  })

  notification.on('click', () => {
    const win = getMainWindow?.()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      notifyRenderer({ accountId, folder, uid, open: true })
    }
  })

  notification.show()
}

async function pollAccount(account) {
  await syncService.sync(decryptAccount(account), 'INBOX')
  lastDiagnostics.delete(account.id)
}

function handleSaved({ accountId, folder, messages, notify }) {
  const key = JSON.stringify([accountId, folder])
  clearTimeout(rendererTimers.get(key))
  rendererTimers.set(key, setTimeout(() => {
    rendererTimers.delete(key)
    notifyRenderer({ accountId, folder, open: false })
  }, 80))
  if (!messages?.length || !notify || String(folder).toUpperCase() !== 'INBOX' || store.getSettings().notificationsEnabled === false) return
  const account = store.getAccount(accountId)
  if (!account) return
  const title = account.name || account.email || 'Webison Mailer'
  if (messages.length > 3) {
    showNotification({ title, body: `${messages.length} nuovi messaggi`, accountId, folder, uid: messages[0].uid })
  } else {
    for (const message of messages) showNotification({ title,
      body: truncate(message.from, 40) + '\n' + truncate(message.subject, 70),
      accountId, folder, uid: message.uid })
  }
}

async function tick() {
  if (running) return

  running = true
  try {
    const accounts = store.listAccounts()
    await Promise.allSettled(accounts.map(async account => {
      try { await pollAccount(account) }
      catch (err) {
        lastDiagnostics.set(account.id, mailErrorInfo(err, {
          service: 'IMAP', host: account.imapHost, port: account.imapPort,
          secure: account.imapSecure, phase: 'controllo nuovi messaggi',
        }))
      }
    }))
  } finally {
    running = false
  }
}

function stopMailWatcher() {
  for (const timer of rendererTimers.values()) clearTimeout(timer)
  rendererTimers.clear()
  clearTimeout(startupTimer)
  startupTimer = null
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startMailWatcher({ decrypt, getWindow }) {
  decryptAccount = decrypt
  getMainWindow = getWindow
  syncService.setListener(handleSaved)
  stopMailWatcher()

  const settings = store.getSettings()
  const ms = Math.max(15, Number(settings.pollIntervalSec) || 60) * 1000

  // baseline subito senza aspettare il primo intervallo
  startupTimer = setTimeout(() => {
    tick()
  }, 4000)

  timer = setInterval(() => {
    tick()
  }, ms)
}

function restartMailWatcher() {
  if (!decryptAccount || !getMainWindow) return
  startMailWatcher({ decrypt: decryptAccount, getWindow: getMainWindow })
}

module.exports = {
  startMailWatcher,
  stopMailWatcher,
  restartMailWatcher,
  tick,
  getLastDiagnostics: () => Object.fromEntries(lastDiagnostics),
}
