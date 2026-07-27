const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

let getWindow = () => null

function send(channel, payload) {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

function setupUpdater({ getMainWindow }) {
  getWindow = getMainWindow
  if (!app.isPackaged) return

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
    }
  } catch {
    // auth opzionale
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
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

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4000)

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 1000 * 60 * 60 * 4)
}

function installUpdate() {
  autoUpdater.quitAndInstall(false, true)
}

module.exports = {
  setupUpdater,
  installUpdate,
}
