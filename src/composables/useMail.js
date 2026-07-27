import { reactive, computed } from 'vue'
import { normalizeColorPreset } from '../theme/presets'

const LOCAL_SENT = 'Sent'

const state = reactive({
  screen: 'mail',
  accounts: [],
  accountId: null,
  folders: [],
  folder: 'INBOX',
  messages: [],
  selectedUid: null,
  selected: null,
  loading: false,
  syncing: false,
  error: '',
  editingAccount: null,
  accountEditor: false,
  settingsSection: 'aspetto',
  contacts: [],
  signatures: [],
  settings: { theme: 'light', colorPreset: 'blu', notificationsEnabled: true, pollIntervalSec: 60 },
  listFilter: 'unread',
  compose: {
    to: '',
    cc: '',
    subject: '',
    text: '',
    html: '',
    useHtml: false,
    inReplyTo: null,
    references: null,
  },
})

const currentAccount = computed(() =>
  state.accounts.find((a) => a.id === state.accountId) || null,
)

const defaultSignature = computed(() =>
  state.signatures.find((s) => s.isDefault) || state.signatures[0] || null,
)

const accountSignature = computed(() => {
  const id = currentAccount.value?.signatureId
  if (id) {
    const linked = state.signatures.find((s) => s.id === id)
    if (linked) return linked
  }
  return defaultSignature.value
})

function friendlyError(err) {
  let msg = err?.message || String(err || 'Errore sconosciuto')
  msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '')
  msg = msg.replace(/^Error:\s*/i, '')
  msg = msg.trim()
  if (/^Command failed$/i.test(msg)) {
    return "Connessione al server fallita. Controlla host, porta, utente e password dell'account."
  }
  return msg || 'Errore sconosciuto'
}

function clearError() {
  state.error = ''
}

function isSentPath(path) {
  return path === LOCAL_SENT || /sent|inviate/i.test(String(path || ''))
}

function isTrashPath(path) {
  const folder = state.folders.find((f) => f.path === path)
  if (folder?.specialUse === '\\Trash') return true
  return /trash|cestino|deleted items|\bbin\b/i.test(String(path || ''))
}

function currentStoreFolder() {
  return isSentPath(state.folder) ? LOCAL_SENT : state.folder
}

function currentImapFolder() {
  if (isSentPath(state.folder)) return imapSentPath()
  return state.folder
}

const displayFolders = computed(() => {
  const others = state.folders.filter(
    (f) => f.specialUse !== '\\Sent' && !isSentPath(f.path),
  )
  return [
    ...others,
    { path: LOCAL_SENT, name: 'Inviate', specialUse: '\\Sent' },
  ]
})

function imapSentPath() {
  return state.folders.find((f) => f.specialUse === '\\Sent' || isSentPath(f.path))?.path || null
}

const filteredMessages = computed(() => {
  let list = state.messages
  if (state.listFilter === 'unread') list = list.filter((m) => !m.seen)
  else if (state.listFilter === 'read') list = list.filter((m) => m.seen)
  return list
})

const displayedMessages = computed(() => {
  const unread = []
  const read = []
  for (const m of filteredMessages.value) {
    if (m.seen) read.push(m)
    else unread.push(m)
  }
  const byDate = (a, b) => (b.date || 0) - (a.date || 0)
  unread.sort(byDate)
  read.sort(byDate)
  return [...unread, ...read]
})

const messageGroups = computed(() => {
  const unread = displayedMessages.value.filter((m) => !m.seen)
  const read = displayedMessages.value.filter((m) => m.seen)
  const groups = []
  if (state.listFilter !== 'read' && unread.length) {
    groups.push({ key: 'unread', label: 'Non lette', items: unread })
  }
  if (state.listFilter !== 'unread' && read.length) {
    groups.push({ key: 'read', label: 'Lette', items: read })
  }
  // se filtro "tutte" ma una sola categoria, mostra comunque i gruppi
  if (!groups.length && filteredMessages.value.length) {
    groups.push({
      key: state.listFilter === 'read' ? 'read' : 'unread',
      label: state.listFilter === 'read' ? 'Lette' : 'Non lette',
      items: displayedMessages.value,
    })
  }
  return groups
})

function setListFilter(filter) {
  state.listFilter = filter === 'unread' || filter === 'read' ? filter : 'all'
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function applyTheme(theme, colorPreset) {
  const value = theme === 'dark' ? 'dark' : 'light'
  const accent = normalizeColorPreset(colorPreset ?? state.settings.colorPreset)
  document.documentElement.setAttribute('data-theme', value)
  document.documentElement.setAttribute('data-accent', accent)
  state.settings.theme = value
  state.settings.colorPreset = accent
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textToHtml(text) {
  return `<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
}

function signatureBlock(asHtml) {
  const sig = accountSignature.value
  if (!sig?.body) return ''
  if (asHtml) {
    const inner = sig.isHtml ? sig.body : textToHtml(sig.body)
    return `<br><br><div class="signature">--<br>${inner}</div>`
  }
  const plain = sig.isHtml ? stripHtml(sig.body) : sig.body
  return `\n\n-- \n${plain}`
}

function withSignature(body, { reply = false, asHtml = false } = {}) {
  const block = signatureBlock(asHtml)
  if (!block) return body || ''
  if (reply) return `${block}${body || ''}`
  return `${body || ''}${block}`
}

function goMail() {
  state.screen = 'mail'
  state.error = ''
}

function openScreen(name) {
  state.screen = name
  state.error = ''
}

function openSettings(section = 'aspetto', account) {
  state.settingsSection = section || 'aspetto'
  if (section === 'account' && arguments.length >= 2) {
    state.editingAccount = account || null
    state.accountEditor = true
  } else {
    state.editingAccount = null
    state.accountEditor = false
  }
  openScreen('settings')
}

function setSettingsSection(section) {
  state.settingsSection = section || 'aspetto'
  if (section !== 'account') {
    state.editingAccount = null
    state.accountEditor = false
  }
}

async function refreshAccounts() {
  state.accounts = await window.webison.listAccounts()
  if (!state.accountId && state.accounts.length) {
    state.accountId = state.accounts[0].id
  }
  if (state.accountId && !state.accounts.some((a) => a.id === state.accountId)) {
    state.accountId = state.accounts[0]?.id || null
  }
}

async function refreshContacts() {
  state.contacts = await window.webison.listContacts()
}

async function refreshSignatures() {
  state.signatures = await window.webison.listSignatures()
}

async function loadSettings() {
  state.settings = await window.webison.getSettings()
  applyTheme(state.settings.theme, state.settings.colorPreset)
}

async function selectAccount(id) {
  state.accountId = id
  state.selectedUid = null
  state.selected = null
  state.error = ''
  await loadFolders()
  await loadLocalMessages()
}

async function loadFolders() {
  if (!state.accountId) {
    state.folders = []
    return
  }
  try {
    state.folders = await window.webison.listFolders(state.accountId)
    if (!isSentPath(state.folder) && !state.folders.some((f) => f.path === state.folder)) {
      const inbox = state.folders.find((f) => f.specialUse === '\\Inbox' || f.path.toUpperCase() === 'INBOX')
      state.folder = inbox?.path || state.folders[0]?.path || 'INBOX'
    }
    if (isSentPath(state.folder)) state.folder = LOCAL_SENT
  } catch (err) {
    state.folders = [{ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' }]
    state.error = friendlyError(err)
  }
}

async function loadLocalMessages() {
  if (!state.accountId) {
    state.messages = []
    return
  }
  const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
  state.messages = await window.webison.listMessages(state.accountId, folder)
}

async function sync() {
  if (!state.accountId || state.syncing) return
  state.syncing = true
  state.error = ''
  try {
    if (isSentPath(state.folder)) {
      const remote = imapSentPath()
      if (remote) {
        await window.webison.syncMail(state.accountId, remote, LOCAL_SENT)
      }
      state.messages = await window.webison.listMessages(state.accountId, LOCAL_SENT)
    } else {
      state.messages = await window.webison.syncMail(state.accountId, state.folder)
    }
  } catch (err) {
    state.error = friendlyError(err)
    await loadLocalMessages()
  } finally {
    state.syncing = false
  }
}

async function selectFolder(path) {
  state.folder = isSentPath(path) ? LOCAL_SENT : path
  state.selectedUid = null
  state.selected = null
  goMail()
  await loadLocalMessages()
}

async function selectMessage(uid) {
  state.selectedUid = uid
  const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
  state.selected = await window.webison.getMessage(state.accountId, folder, uid)
  if (state.selected && !state.selected.seen) {
    await setMessageSeen(true)
  }
}

async function setMessageSeen(seen, uid = null) {
  const targetUid = uid ?? state.selectedUid
  if (!state.accountId || targetUid == null) return
  const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
  try {
    const updated = await window.webison.setMessageSeen(
      state.accountId,
      folder,
      targetUid,
      Boolean(seen),
    )
    if (updated) {
      const idx = state.messages.findIndex((m) => String(m.uid) === String(targetUid))
      if (idx >= 0) state.messages[idx] = { ...state.messages[idx], seen: Boolean(seen) }
      if (String(state.selectedUid) === String(targetUid) && state.selected) {
        state.selected = { ...state.selected, ...updated, seen: Boolean(seen) }
      }
    }
  } catch (err) {
    state.error = friendlyError(err)
  }
}

async function deleteMessage(uid = null) {
  const targetUid = uid ?? state.selectedUid
  if (!state.accountId || targetUid == null || state.loading) return

  const storeFolder = currentStoreFolder()
  const imapFolder = currentImapFolder()
  const permanent = isTrashPath(state.folder) || String(targetUid).startsWith('local-')

  if (permanent) {
    const ok = window.confirm(
      isTrashPath(state.folder)
        ? 'Eliminare definitivamente questo messaggio dal cestino?'
        : 'Eliminare definitivamente questo messaggio?',
    )
    if (!ok) return
  }

  state.loading = true
  state.error = ''
  try {
    state.messages = await window.webison.deleteMessages(
      state.accountId,
      imapFolder || null,
      [targetUid],
      { storeAs: storeFolder, permanent: permanent || !imapFolder },
    )
    if (String(state.selectedUid) === String(targetUid)) {
      state.selectedUid = null
      state.selected = null
    }
  } catch (err) {
    state.error = friendlyError(err)
    await loadLocalMessages()
  } finally {
    state.loading = false
  }
}

async function emptyTrash() {
  if (!state.accountId || state.loading) return
  if (!isTrashPath(state.folder)) return
  const ok = window.confirm('Svuotare il cestino? I messaggi verranno eliminati definitivamente.')
  if (!ok) return

  state.loading = true
  state.error = ''
  try {
    await window.webison.emptyTrash(state.accountId)
    state.messages = []
    state.selectedUid = null
    state.selected = null
  } catch (err) {
    state.error = friendlyError(err)
  } finally {
    state.loading = false
  }
}

function splitAddresses(value) {
  if (!value) return []
  const parts = []
  let cur = ''
  let depth = 0
  for (const ch of String(value)) {
    if (ch === '<') depth += 1
    else if (ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function normalizeEmail(addr) {
  const raw = String(addr || '').trim()
  if (!raw) return ''
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).trim().toLowerCase()
}

function replyAllCc(selected, replyTo) {
  const mine = normalizeEmail(currentAccount.value?.email)
  const replyToEmail = normalizeEmail(replyTo)
  const seen = new Set([mine, replyToEmail].filter(Boolean))
  const out = []
  for (const addr of [...splitAddresses(selected.to), ...splitAddresses(selected.cc)]) {
    const email = normalizeEmail(addr)
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(addr)
  }
  return out.join(', ')
}

function openCompose(reply = false, replyAll = false) {
  const preferHtml = Boolean(accountSignature.value?.isHtml) || Boolean(state.selected?.html)
  if (reply && state.selected) {
    const from = state.selected.from || ''
    const quoteText = `\n\n---\nIl ${formatDate(state.selected.date)}, ${from} ha scritto:\n${state.selected.text || stripHtml(state.selected.html || '')}`
    const quoteHtml = `<br><br><hr><p>Il ${escapeHtml(formatDate(state.selected.date))}, ${escapeHtml(from)} ha scritto:</p><blockquote>${state.selected.html || textToHtml(state.selected.text || '')}</blockquote>`
    state.compose = {
      to: from,
      cc: replyAll ? replyAllCc(state.selected, from) : '',
      subject: state.selected.subject?.startsWith('Re:')
        ? state.selected.subject
        : `Re: ${state.selected.subject || ''}`,
      text: withSignature(quoteText, { reply: true, asHtml: false }),
      html: withSignature(quoteHtml, { reply: true, asHtml: true }),
      useHtml: preferHtml,
      inReplyTo: state.selected.messageId,
      references: state.selected.messageId,
    }
  } else {
    state.compose = {
      to: '',
      cc: '',
      subject: '',
      text: withSignature('', { asHtml: false }),
      html: withSignature('', { asHtml: true }),
      useHtml: preferHtml,
      inReplyTo: null,
      references: null,
    }
  }
  openScreen('compose')
}

async function sendMail() {
  if (!state.accountId) return
  state.loading = true
  state.error = ''
  try {
    const useHtml = state.compose.useHtml
    const html = useHtml ? state.compose.html : ''
    const text = useHtml ? stripHtml(html) : state.compose.text
    await window.webison.sendMail({
      accountId: state.accountId,
      to: state.compose.to,
      cc: state.compose.cc,
      subject: state.compose.subject,
      text,
      html: useHtml ? html : undefined,
      inReplyTo: state.compose.inReplyTo,
      references: state.compose.references,
    })
    goMail()
    state.folder = LOCAL_SENT
    await loadLocalMessages()
  } catch (err) {
    state.error = friendlyError(err)
  } finally {
    state.loading = false
  }
}

async function saveAccount(form) {
  const saved = await window.webison.saveAccount(form)
  await refreshAccounts()
  await selectAccount(saved.id)
  state.editingAccount = null
  state.accountEditor = false
  if (state.screen === 'settings') {
    state.settingsSection = 'account'
  } else {
    goMail()
  }
}

async function deleteAccount(id) {
  await window.webison.deleteAccount(id)
  await refreshAccounts()
  if (state.accountId) await selectAccount(state.accountId)
  else {
    state.messages = []
    state.selected = null
    state.folders = []
  }
  state.editingAccount = null
  state.accountEditor = false
  if (state.screen === 'settings') {
    state.settingsSection = 'account'
  } else {
    goMail()
  }
}

function openAccountDialog(account = null) {
  openSettings('account', account)
}

async function saveContact(form) {
  await window.webison.saveContact(form)
  await refreshContacts()
}

async function deleteContact(id) {
  await window.webison.deleteContact(id)
  await refreshContacts()
}

async function saveSignature(form) {
  await window.webison.saveSignature(form)
  await refreshSignatures()
}

async function deleteSignature(id) {
  await window.webison.deleteSignature(id)
  await refreshSignatures()
  await refreshAccounts()
}

async function saveSettings(patch) {
  if (patch?.theme != null || patch?.colorPreset != null) {
    applyTheme(patch.theme ?? state.settings.theme, patch.colorPreset ?? state.settings.colorPreset)
  }
  state.settings = await window.webison.setSettings(patch)
  applyTheme(state.settings.theme, state.settings.colorPreset)
}

async function handleMailNew({ accountId, folder = 'INBOX', uid = null, open = false } = {}) {
  if (!open) {
    const currentFolder = String(state.folder || '').toUpperCase()
    if (accountId === state.accountId && currentFolder === String(folder).toUpperCase()) {
      await sync()
    }
    return
  }

  if (accountId) await selectAccount(accountId)
  const inbox = state.folders.find(
    (f) => f.specialUse === '\\Inbox' || f.path.toUpperCase() === 'INBOX',
  )
  const targetFolder =
    state.folders.find((f) => f.path === folder)?.path ||
    inbox?.path ||
    folder ||
    'INBOX'
  await selectFolder(targetFolder)
  await sync()
  if (uid != null && state.messages.some((message) => String(message.uid) === String(uid))) {
    await selectMessage(uid)
  }
}

async function markAllInboxRead() {
  await window.webison.markAllInboxRead()
  if (state.accountId) {
    await selectAccount(state.accountId)
    await sync()
  } else {
    await refreshAccounts()
  }
}

async function bootstrap() {
  await loadSettings()
  await refreshAccounts()
  await refreshContacts()
  await refreshSignatures()
  if (state.accountId) await selectAccount(state.accountId)
}

export function useMail() {
  return {
    state,
    currentAccount,
    defaultSignature,
    accountSignature,
    clearError,
    displayFolders,
    filteredMessages,
    displayedMessages,
    messageGroups,
    formatDate,
    stripHtml,
    bootstrap,
    goMail,
    openScreen,
    openSettings,
    setSettingsSection,
    setListFilter,
    refreshAccounts,
    refreshContacts,
    refreshSignatures,
    selectAccount,
    selectFolder,
    selectMessage,
    setMessageSeen,
    deleteMessage,
    emptyTrash,
    isTrashPath,
    sync,
    openCompose,
    sendMail,
    saveAccount,
    deleteAccount,
    openAccountDialog,
    saveContact,
    deleteContact,
    saveSignature,
    deleteSignature,
    saveSettings,
    handleMailNew,
    markAllInboxRead,
    LOCAL_SENT,
  }
}
