const { Notification } = require('electron')
const store = require('./store.cjs')
const imap = require('./imap.cjs')
const { mailErrorInfo } = require('./errors.cjs')
const { sendMailNewWhenReady } = require('./notification-target.cjs')

let timer = null
let running = false
let decryptAccount = null
let getMainWindow = null
const lastDiagnostics = new Map()

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
  const full = decryptAccount(account)
  const messages = await imap.checkNewMessages(full, 'INBOX', 30)
  lastDiagnostics.delete(account.id)
  const uids = messages.map((m) => m.uid)
  const prev = store.getAccountNotifyState(account.id)

  if (!prev.initialized) {
    store.setAccountNotifyState(account.id, { uids, initialized: true })
    return
  }

  const known = new Set(prev.uids.map(Number))
  const fresh = messages.filter((m) => !known.has(m.uid)).sort((a, b) => a.date - b.date)

  store.setAccountNotifyState(account.id, {
    uids: [...new Set([...prev.uids, ...uids])].slice(-200),
    initialized: true,
  })

  if (!fresh.length) return

  const title = account.name || account.email || 'Webison Mailer'
  if (fresh.length > 3) {
    const latest = fresh[fresh.length - 1]
    showNotification({
      title,
      body: `${fresh.length} nuovi messaggi`,
      accountId: account.id,
      uid: latest?.uid,
    })
  } else {
    for (const msg of fresh) {
      showNotification({
        title,
        body: `${truncate(msg.from, 40)}\n${truncate(msg.subject, 70)}`,
        accountId: account.id,
        uid: msg.uid,
      })
    }
  }

  notifyRenderer({ accountId: account.id, folder: 'INBOX', open: false })
}

async function tick() {
  if (running) return
  const settings = store.getSettings()
  if (settings.notificationsEnabled === false) return

  running = true
  try {
    const accounts = store.listAccounts()
    for (const account of accounts) {
      try {
        await pollAccount(account)
      } catch (err) {
        lastDiagnostics.set(account.id, mailErrorInfo(err, {
          service: 'IMAP',
          host: account.imapHost,
          port: account.imapPort,
          secure: account.imapSecure,
          phase: 'controllo nuovi messaggi',
        }))
        // un account offline non deve fermare gli altri
      }
    }
  } finally {
    running = false
  }
}

function stopMailWatcher() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startMailWatcher({ decrypt, getWindow }) {
  decryptAccount = decrypt
  getMainWindow = getWindow
  stopMailWatcher()

  const settings = store.getSettings()
  const ms = Math.max(15, Number(settings.pollIntervalSec) || 60) * 1000

  // baseline subito senza aspettare il primo intervallo
  setTimeout(() => {
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
