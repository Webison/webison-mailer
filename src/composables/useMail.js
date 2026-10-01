import { reactive, computed } from 'vue'
import { normalizeColorPreset } from '../theme/presets.js'
import {
  buildForwardIntro,
  buildForwardSubject,
  buildReferenceChain,
  buildReplyHtml,
  buildReplyText,
} from '../utils/reply.mjs'

const LOCAL_SENT = 'Sent'

const state = reactive({
  screen: 'mail',
  accounts: [],
  accountId: null,
  folders: [],
  folder: 'INBOX',
  messages: [],
  messageTotal: 0,
  nextCursor: null,
  loadingMore: false,
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
  listFilter: 'all',
  calendarInvite: null,
  compose: {
    to: '',
    cc: '',
    subject: '',
    text: '',
    html: '',
    useHtml: true,
    isReply: false,
    isForward: false,
    quoteIntro: '',
    quoteText: '',
    quoteHtml: '',
    inReplyTo: null,
    references: null,
    attachments: [],
  },
})

let listRevision = 0
let selectionRevision = 0
let navigationRevision = 0
const syncingFolders = new Set()
const viewKey = () => JSON.stringify([state.accountId, state.folder, state.listFilter])
const mailboxKey = () => JSON.stringify([state.accountId, state.folder])

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
  void loadLocalMessages().catch(err => { state.error = friendlyError(err) })
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '- ')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textToHtml(text) {
  return `<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
}

function formatReplyDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const stagingIds = (state.compose.attachments || []).map((att) => att.stagingId).filter(Boolean)
  if (stagingIds.length && window.webison?.removeStagingAttachment) {
    stagingIds.forEach((id) => {
      window.webison.removeStagingAttachment(id).catch(() => {})
    })
  }
  state.compose.attachments = []
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

function clearSelectedMessage() {
  selectionRevision++
  state.selectedUid = null
  state.selected = null
  state.calendarInvite = null
}

async function selectAccount(id) {
  const revision = ++navigationRevision
  state.accountId = id
  state.folder = 'INBOX'
  state.folders = [{ path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox' }]
  state.syncing = syncingFolders.has(mailboxKey())
  clearSelectedMessage()
  state.error = ''
  await loadLocalMessages()
  if (revision !== navigationRevision) return
  void loadFolders()
  void sync()
}

async function loadFolders() {
  const accountId = state.accountId
  const revision = navigationRevision
  if (!accountId) return
  try {
    const folders = await window.webison.listFolders(accountId)
    if (state.accountId !== accountId || revision !== navigationRevision) return
    state.folders = folders
  } catch (err) {
    if (state.accountId === accountId && revision === navigationRevision) state.error = friendlyError(err)
  }
}

async function loadLocalMessages(append = false) {
  if (!state.accountId) {
    state.messages = []; state.messageTotal = 0; state.nextCursor = null
    return
  }
  if (append && (!state.nextCursor || state.loadingMore)) return
  const key = viewKey()
  const revision = append ? listRevision : ++listRevision
  const cursor = append ? state.nextCursor : null
  if (!append) { state.messages = []; state.nextCursor = null; state.messageTotal = 0 }
  state.loadingMore = true
  try {
    const page = await window.webison.listMessages(state.accountId, currentStoreFolder(), { filter: state.listFilter, cursor })
    if (key !== viewKey() || revision !== listRevision) return
    const known = new Set(append ? state.messages.map(m => String(m.uid)) : [])
    state.messages = [...(append ? state.messages : []), ...page.items.filter(m => !known.has(String(m.uid)))]
    state.messageTotal = page.folderTotal ?? page.total
    state.nextCursor = page.nextCursor
    if (page.warning) state.error = page.warning
  } catch (err) {
    if (key === viewKey() && revision === listRevision) {
      state.error = friendlyError(err)
      state.nextCursor = null
    }
  } finally {
    if (revision === listRevision) state.loadingMore = false
  }
}

async function loadMoreMessages() { await loadLocalMessages(true) }

async function sync() {
  if (!state.accountId) return
  const accountId = state.accountId
  const folder = state.folder
  const storeFolder = currentStoreFolder()
  const remote = currentImapFolder()
  const key = mailboxKey()
  if (!remote || syncingFolders.has(key)) return
  syncingFolders.add(key)
  state.syncing = true
  try {
    await window.webison.syncMail(accountId, remote, storeFolder)
    if (state.accountId === accountId && state.folder === folder) await loadLocalMessages()
  } catch (err) {
    if (mailboxKey() === key) state.error = friendlyError(err)
  } finally {
    syncingFolders.delete(key)
    state.syncing = syncingFolders.has(mailboxKey())
  }
}

async function selectFolder(path) {
  const revision = ++navigationRevision
  state.folder = isSentPath(path) ? LOCAL_SENT : path
  state.syncing = syncingFolders.has(mailboxKey())
  clearSelectedMessage()
  goMail()
  await loadLocalMessages()
  if (revision !== navigationRevision) return
  void sync()
}

async function selectMessage(uid) {
  const revision = ++selectionRevision
  const key = mailboxKey()
  state.selectedUid = uid
  state.selected = null
  state.calendarInvite = null
  try {
    const message = await window.webison.getMessage(state.accountId, currentStoreFolder(), uid)
    if (revision !== selectionRevision || key !== mailboxKey()) return
    state.selected = message
    if (message && !message.seen) void setMessageSeen(true)
    void loadCalendarInvite()
  } catch (err) {
    if (revision === selectionRevision && key === mailboxKey()) state.error = friendlyError(err)
  }
}

function isCalendarAttachment(att) {
  if (!att) return false
  const type = String(att.contentType || '').toLowerCase()
  const name = String(att.filename || '').toLowerCase()
  return (
    type.includes('text/calendar') ||
    type.includes('application/ics') ||
    name.endsWith('.ics')
  )
}

function findCalendarAttachment(message) {
  const list = Array.isArray(message?.attachments) ? message.attachments : []
  return list.find((att) => att?.stored && isCalendarAttachment(att)) || null
}

async function loadCalendarInvite() {
  state.calendarInvite = null
  if (!state.accountId || !state.selected || state.selectedUid == null) return
  const revision = selectionRevision
  const key = mailboxKey()
  const attachment = findCalendarAttachment(state.selected)
  if (!attachment?.id || !window.webison?.parseCalendarAttachment) return
  try {
    const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
    const summary = await window.webison.parseCalendarAttachment(
      state.accountId,
      folder,
      state.selectedUid,
      attachment.id,
    )
    if (revision !== selectionRevision || key !== mailboxKey()) return
    state.calendarInvite = {
      attachmentId: attachment.id,
      filename: attachment.filename || summary.filename || 'invito.ics',
      ...summary,
    }
  } catch {
    // invito non leggibile: nessuna card
  }
}

async function openCalendarInvite() {
  if (!state.accountId || state.selectedUid == null || !state.calendarInvite?.attachmentId) return
  state.loading = true
  state.error = ''
  try {
    const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
    await window.webison.openCalendarAttachment(
      state.accountId,
      folder,
      state.selectedUid,
      state.calendarInvite.attachmentId,
    )
  } catch (err) {
    state.error = friendlyError(err)
  } finally {
    state.loading = false
  }
}

async function joinCalendarMeeting() {
  const url = state.calendarInvite?.meetingUrl
  if (!url || !window.webison?.openExternal) return
  try {
    await window.webison.openExternal(url)
  } catch (err) {
    state.error = friendlyError(err)
  }
}

async function saveCalendarInvite() {
  if (!state.calendarInvite?.attachmentId) return
  const attachment = (state.selected?.attachments || []).find(
    (item) => String(item.id) === String(state.calendarInvite.attachmentId),
  ) || {
    id: state.calendarInvite.attachmentId,
    filename: state.calendarInvite.filename || 'invito.ics',
  }
  await saveSelectedAttachment(attachment)
}

async function setMessageSeen(seen, uid = null) {
  const targetUid = uid ?? state.selectedUid
  if (!state.accountId || targetUid == null) return
  const folder = isSentPath(state.folder) ? LOCAL_SENT : state.folder
  const key = mailboxKey()
  try {
    const updated = await window.webison.setMessageSeen(
      state.accountId,
      folder,
      targetUid,
      Boolean(seen),
    )
    if (key !== mailboxKey()) return
    if (updated) {
      const idx = state.messages.findIndex((m) => String(m.uid) === String(targetUid))
      if (idx >= 0) state.messages[idx] = { ...state.messages[idx], seen: Boolean(seen) }
      if (String(state.selectedUid) === String(targetUid) && state.selected) {
        state.selected = { ...state.selected, seen: Boolean(seen) }
      }
      await loadLocalMessages()
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
  const permanent = isTrashPath(state.folder) || !/^\d+$/.test(String(targetUid))

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
    const key = mailboxKey()
    await window.webison.deleteMessages(
      state.accountId,
      imapFolder || null,
      [targetUid],
      { storeAs: storeFolder, permanent: permanent || !imapFolder },
    )
    if (key !== mailboxKey()) return
    await loadLocalMessages()
    if (String(state.selectedUid) === String(targetUid)) {
      clearSelectedMessage()
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
    state.messageTotal = 0
    state.nextCursor = null
    clearSelectedMessage()
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

function isForwardableAttachment(att, html) {
  if (!att?.id || !att?.stored) return false
  if (att.disposition === 'attachment') return true
  const cid = String(att.contentId || '').replace(/^<|>$/g, '').trim().toLowerCase()
  if (!cid) return true
  if (att.disposition === 'inline' && html.includes(`cid:${cid}`)) return false
  return true
}

function listForwardableAttachments(message) {
  const list = Array.isArray(message?.attachments) ? message.attachments : []
  const html = String(message?.html || '').toLowerCase()
  return list.filter((att) => isForwardableAttachment(att, html))
}

async function stageForwardAttachments(message) {
  if (!state.accountId || !message?.uid) return []
  const folder = currentStoreFolder()
  const staged = []
  for (const att of listForwardableAttachments(message)) {
    if (staged.length >= 20) break
    try {
      const item = await window.webison.stageAttachmentFromMessage(
        state.accountId,
        folder,
        message.uid,
        att.id,
        {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
        },
      )
      if (item?.stagingId) staged.push(item)
    } catch {
      // allegato mancante o troppo grande: salta
    }
  }
  return staged
}

async function openCompose(reply = false, replyAll = false, forward = false) {
  if (forward && state.selected) {
    const selected = state.selected
    const quoteText = selected.text || stripHtml(selected.html || '')
    const quoteHtml = selected.html || textToHtml(selected.text || '')
    const quoteIntro = buildForwardIntro({
      from: selected.from || '',
      to: selected.to || '',
      cc: selected.cc || '',
      date: formatReplyDate(selected.date),
      subject: selected.subject || '',
    })
    const attachments = await stageForwardAttachments(selected)
    state.compose = {
      to: '',
      cc: '',
      subject: buildForwardSubject(selected.subject),
      text: withSignature('', { asHtml: false }),
      html: withSignature('', { asHtml: true }),
      useHtml: true,
      isReply: false,
      isForward: true,
      quoteIntro,
      quoteText,
      quoteHtml,
      inReplyTo: null,
      references: null,
      attachments,
    }
  } else if (reply && state.selected) {
    const from = state.selected.from || ''
    const quoteText = state.selected.text || stripHtml(state.selected.html || '')
    const quoteHtml = state.selected.html || textToHtml(state.selected.text || '')
    const quoteIntro = `Il ${formatReplyDate(state.selected.date)}, ${from} ha scritto:`
    state.compose = {
      to: from,
      cc: replyAll ? replyAllCc(state.selected, from) : '',
      subject: state.selected.subject?.startsWith('Re:')
        ? state.selected.subject
        : `Re: ${state.selected.subject || ''}`,
      text: withSignature('', { asHtml: false }),
      html: withSignature('', { asHtml: true }),
      useHtml: true,
      isReply: true,
      isForward: false,
      quoteIntro,
      quoteText,
      quoteHtml,
      inReplyTo: state.selected.messageId,
      references: buildReferenceChain(state.selected.references, state.selected.messageId),
      attachments: [],
    }
  } else {
    state.compose = {
      to: '',
      cc: '',
      subject: '',
      text: withSignature('', { asHtml: false }),
      html: withSignature('', { asHtml: true }),
      useHtml: true,
      isReply: false,
      isForward: false,
      quoteIntro: '',
      quoteText: '',
      quoteHtml: '',
      inReplyTo: null,
      references: null,
      attachments: [],
    }
  }
  openScreen('compose')
}

async function pickComposeAttachments() {
  try {
    const picked = await window.webison.pickAttachments()
    if (!picked?.length) return
    const current = Array.isArray(state.compose.attachments) ? state.compose.attachments : []
    const next = [...current]
    for (const item of picked) {
      if (next.length >= 20) break
      if (next.some((att) => att.stagingId === item.stagingId)) continue
      next.push(item)
    }
    state.compose.attachments = next
  } catch (err) {
    state.error = friendlyError(err)
  }
}

async function removeComposeAttachment(stagingId) {
  state.compose.attachments = (state.compose.attachments || []).filter(
    (att) => att.stagingId !== stagingId,
  )
  try {
    await window.webison.removeStagingAttachment(stagingId)
  } catch {
    // ignore
  }
}

async function saveSelectedAttachment(attachment) {
  if (!state.accountId || !state.selectedUid || !attachment?.id) return
  try {
    await window.webison.saveAttachment(
      state.accountId,
      currentStoreFolder(),
      state.selectedUid,
      attachment.id,
      attachment.filename,
    )
  } catch (err) {
    state.error = friendlyError(err)
  }
}

function messageHasAttachments(message) {
  if (message?.hasAttachments != null) return message.hasAttachments
  const list = Array.isArray(message?.attachments) ? message.attachments : []
  if (!list.length) return false
  const html = String(message.html || '').toLowerCase()
  return list.some((att) => {
    if (att.disposition === 'attachment') return true
    const cid = String(att.contentId || '').replace(/^<|>$/g, '').trim().toLowerCase()
    if (!cid) return true
    if (att.disposition === 'inline' && html.includes(`cid:${cid}`)) return false
    return true
  })
}

function formatAttachmentSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function sendMail() {
  if (!state.accountId) return
  state.loading = true
  state.error = ''
  try {
    const replyText = stripHtml(state.compose.html)
    const hasQuote = Boolean(state.compose.isReply || state.compose.isForward)
    const html = hasQuote
      ? buildReplyHtml(state.compose.html, state.compose.quoteIntro, state.compose.quoteHtml)
      : state.compose.html
    const text = hasQuote
      ? buildReplyText(replyText, state.compose.quoteIntro, state.compose.quoteText)
      : replyText
    // I dati nel reactive state di Vue sono Proxy e non possono essere trasferiti
    // tramite IPC. In particolare references, usato nelle risposte, va ridotto a
    // un array di stringhe prima di inviarlo al processo principale.
    const references = Array.isArray(state.compose.references)
      ? state.compose.references.map((reference) => String(reference || '').trim()).filter(Boolean)
      : []
    const attachmentIds = (state.compose.attachments || [])
      .map((attachment) => String(attachment?.stagingId || '').trim())
      .filter(Boolean)
    await window.webison.sendMail({
      accountId: state.accountId,
      to: state.compose.to,
      cc: state.compose.cc,
      subject: state.compose.subject,
      text,
      html: html || undefined,
      inReplyTo: state.compose.inReplyTo ? String(state.compose.inReplyTo) : null,
      references,
      attachmentIds,
    })
    state.compose.attachments = []
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
    clearSelectedMessage()
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
    if (accountId === state.accountId && folder === currentStoreFolder()) await loadLocalMessages()
    return
  }
  const revision = ++navigationRevision
  state.accountId = accountId || state.accountId
  state.folder = isSentPath(folder) ? LOCAL_SENT : folder
  state.syncing = syncingFolders.has(mailboxKey())
  clearSelectedMessage()
  goMail()
  // Opening the body does not depend on pagination or the current filter.
  if (uid != null) void selectMessage(uid)
  await loadLocalMessages()
  if (revision !== navigationRevision) return
  void loadFolders()
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
  const revision = navigationRevision
  await Promise.all([loadSettings(), refreshAccounts()])
  void Promise.all([refreshContacts(), refreshSignatures()]).catch(err => { state.error = friendlyError(err) })
  if (state.accountId && revision === navigationRevision) {
    await selectAccount(state.accountId)
    void syncInboxesAtStartup()
  }
}

async function syncInboxesAtStartup() {
  await Promise.allSettled(state.accounts.map(async account => {
    await window.webison.syncMail(account.id, 'INBOX')
    if (state.accountId === account.id && state.folder === 'INBOX') await loadLocalMessages()
  }))
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
    loadMoreMessages,
    setMessageSeen,
    deleteMessage,
    emptyTrash,
    isTrashPath,
    sync,
    openCompose,
    pickComposeAttachments,
    removeComposeAttachment,
    saveSelectedAttachment,
    openCalendarInvite,
    joinCalendarMeeting,
    saveCalendarInvite,
    isCalendarAttachment,
    messageHasAttachments,
    formatAttachmentSize,
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
