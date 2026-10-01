import test from 'node:test'
import assert from 'node:assert/strict'
import { useMail } from '../src/composables/useMail.js'

const mail = useMail()
const { state } = mail
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
const page = uid => ({ items: [{ uid, seen: true }], total: 1, nextCursor: null })
function setup(overrides = {}) {
  state.accountId = 'a'; state.folder = 'INBOX'; state.listFilter = 'all'
  state.selected = null; state.selectedUid = null; state.messages = []
  globalThis.window = { webison: {
    listMessages: async () => page(1), listFolders: async () => [{ path: 'INBOX' }],
    syncMail: async () => ({}), getMessage: async (_a, _f, uid) => ({ uid, seen: true, text: 'Corpo locale' }),
    ...overrides,
  } }
}

test('la notifica apre il corpo fuori pagina e filtro senza aspettare rete o lista', async () => {
  const blocked = deferred()
  let networkCalls = 0
  setup({ listMessages: () => blocked.promise,
    listFolders: () => { networkCalls++; return blocked.promise },
    syncMail: () => { networkCalls++; return blocked.promise },
    setMessageSeen: () => blocked.promise,
    getMessage: async (_a, _f, uid) => ({ uid, seen: false, text: 'Corpo locale' }),
  })
  state.listFilter = 'read'
  const event = mail.handleMailNew({ accountId: 'a', folder: 'INBOX', uid: 9999, open: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.selected.uid, 9999)
  assert.equal(state.selected.text, 'Corpo locale')
  assert.equal(networkCalls, 0)
  blocked.resolve(page(1))
  await event
})

test('il cambio rapido di account scarta una pagina del vecchio account', async () => {
  const old = deferred()
  setup({ listMessages: account => account === 'a' ? old.promise : Promise.resolve(page(2)) })
  const first = mail.selectAccount('a')
  await mail.selectAccount('b')
  old.resolve(page(1))
  await first
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.accountId, 'b')
  assert.equal(state.messages[0].uid, 2)
})

test('una selezione lenta non sovrascrive il messaggio selezionato dopo', async () => {
  const old = deferred()
  setup({ getMessage: async (_a, _f, uid) => uid === 1 ? old.promise : { uid, seen: true } })
  const first = mail.selectMessage(1)
  await mail.selectMessage(2)
  old.resolve({ uid: 1, seen: true })
  await first
  assert.equal(state.selected.uid, 2)
})
