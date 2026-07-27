const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

let getWindow = () => null

function send(channel, payload) {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

function configureFeed() {
  try {
    const auth = require('./update-auth.cjs')
    if (auth?.token) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'Webison',
        repo: 'webison-mailer',
        private: true,
        token: auth.token,
      })
      return
    }
  } catch {
    // ignore
  }
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Webison',
    repo: 'webison-mailer',
    private: false,
  })
}

function setupUpdater({ getMainWindow }) {
  getWindow = getMainWindow
  if (!app.isPackaged) return

  configureFeed()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    send('update:checking', {})
  })

  autoUpdater.on('update-available', (info) => {
    send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    send('update:not-available', {
      version: info?.version || app.getVersion(),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    })
  })

  autoUpdater.on('error', (err) => {
    send('update:error', { message: err?.message || String(err) })
  })

  // subito all'avvio
  setTimeout(() => {
    checkForUpdates().catch(() => {})
  }, 1500)

  setInterval(() => {
    checkForUpdates().catch(() => {})
  }, 1000 * 60 * 60 * 4)
}

function checkForUpdates() {
  if (!app.isPackaged) {
    return Promise.resolve(null)
  }
  return autoUpdater.checkForUpdates()
}

function installUpdate() {
  autoUpdater.quitAndInstall(false, true)
}

module.exports = {
  setupUpdater,
  checkForUpdates,
  installUpdate,
}
