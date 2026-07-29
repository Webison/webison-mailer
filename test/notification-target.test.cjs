const test = require('node:test')
const assert = require('node:assert/strict')
const { sendMailNewWhenReady } = require('../electron/mail/notification-target.cjs')

function fakeWindow({ loading = false } = {}) {
  let loadListener = null
  const sent = []
  const webContents = {
    isDestroyed: () => false,
    isLoadingMainFrame: () => loading,
    once: (event, listener) => {
      assert.equal(event, 'did-finish-load')
      loadListener = listener
    },
    send: (channel, payload) => sent.push({ channel, payload }),
  }
  return {
    win: { isDestroyed: () => false, webContents },
    sent,
    finishLoad: () => loadListener?.(),
  }
}

test('apre subito la mail quando la finestra è pronta', () => {
  const target = fakeWindow()
  const payload = { accountId: 'a1', folder: 'INBOX', uid: 42, open: true }

  assert.equal(sendMailNewWhenReady(target.win, payload), true)
  assert.deepEqual(target.sent, [{ channel: 'mail:new', payload }])
})

test('attende il caricamento della UI prima di aprire la mail notificata', () => {
  const target = fakeWindow({ loading: true })
  const payload = { accountId: 'a1', folder: 'INBOX', uid: 42, open: true }

  assert.equal(sendMailNewWhenReady(target.win, payload), true)
  assert.equal(target.sent.length, 0)
  target.finishLoad()
  assert.deepEqual(target.sent, [{ channel: 'mail:new', payload }])
})
