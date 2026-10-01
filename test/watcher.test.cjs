const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')

function fixture({ enabled = false, failAccount = null } = {}) {
  const syncCalls = [], notifications = [], rendererEvents = []
  let listener
  const filename = require.resolve('../electron/mail/watcher.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(require('node:path').dirname(filename))
  const defaultRequire = module.require.bind(module)
  module.require = name => {
    if (name === 'electron') return { Notification: class {
      static isSupported() { return true }
      constructor(options) { this.options = options }
      on() {}
      show() { notifications.push(this.options) }
    } }
    if (name === './store.cjs') return {
      getSettings: () => ({ notificationsEnabled: enabled, pollIntervalSec: 60 }),
      listAccounts: () => [{ id: 'a' }, { id: 'b' }],
      getAccount: id => ({ id, name: id }),
    }
    if (name === './sync.cjs') return {
      setListener: next => { listener = next },
      sync: async account => { syncCalls.push(account.id); if (account.id === failAccount) throw new Error('offline') },
    }
    if (name === './notification-target.cjs') return { sendMailNewWhenReady: (_win, payload) => rendererEvents.push(payload) }
    return defaultRequire(name)
  }
  module._compile(fs.readFileSync(filename, 'utf8'), filename)
  const watcher = module.exports
  watcher.startMailWatcher({ decrypt: account => account, getWindow: () => ({}) })
  return { watcher, syncCalls, notifications, rendererEvents, emit: event => listener(event) }
}

test('notifiche disabilitate: continua a sincronizzare tutti gli account e aggiorna la UI', async () => {
  const f = fixture({ failAccount: 'a' })
  try {
    await f.watcher.tick()
    assert.deepEqual(f.syncCalls.sort(), ['a', 'b'])
    f.emit({ accountId: 'b', folder: 'INBOX', messages: [{ uid: 1 }], notify: true })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(f.notifications.length, 0)
    assert.equal(f.rendererEvents.length, 1)
  } finally { f.watcher.stopMailWatcher() }
})

test('raggruppa le notifiche di un lotto e accorpa gli aggiornamenti della lista', async () => {
  const f = fixture({ enabled: true })
  try {
    const messages = Array.from({ length: 50 }, (_, i) => ({ uid: 50 - i }))
    for (const message of messages) f.emit({ accountId: 'a', folder: 'INBOX', message, notify: false })
    f.emit({ accountId: 'a', folder: 'INBOX', messages, notify: true })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(f.notifications.length, 1)
    assert.equal(f.notifications[0].body, '50 nuovi messaggi')
    assert.equal(f.rendererEvents.length, 1)
  } finally { f.watcher.stopMailWatcher() }
})
