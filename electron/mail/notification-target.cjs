function sendMailNewWhenReady(win, payload) {
  const contents = win?.webContents
  if (!win || win.isDestroyed() || !contents || contents.isDestroyed()) return false

  const send = () => {
    if (!win.isDestroyed() && !contents.isDestroyed()) {
      contents.send('mail:new', payload)
    }
  }

  if (contents.isLoadingMainFrame()) {
    contents.once('did-finish-load', send)
  } else {
    send()
  }
  return true
}

module.exports = { sendMailNewWhenReady }
