const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { validAccountId } = require('./validation.cjs')

let root = ''

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function accountsPath() {
  return path.join(root, 'accounts.json')
}

function contactsPath() {
  return path.join(root, 'contacts.json')
}

function signaturesPath() {
  return path.join(root, 'signatures.json')
}

function settingsPath() {
  return path.join(root, 'settings.json')
}

function notifyStatePath() {
  return path.join(root, 'notify-state.json')
}

function mailboxDir(accountId, folder) {
  const id = validAccountId(accountId)
  let safe = String(folder || 'INBOX').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  if (safe === '.' || safe === '..') safe = `_${safe.replace(/\./g, 'dot')}`
  const mailRoot = path.resolve(root, 'mail')
  const target = path.resolve(mailRoot, id, safe)
  const prefix = `${mailRoot}${path.sep}`.toLowerCase()
  if (!target.toLowerCase().startsWith(prefix)) {
    throw new Error('Percorso mailbox non valido')
  }
  return target
}

function messagesPath(accountId, folder) {
  return path.join(mailboxDir(accountId, folder), 'messages.json')
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function init(userDataPath) {
  root = path.join(userDataPath, 'webison-data')
  ensureDir(root)
  ensureDir(path.join(root, 'mail'))
  if (!fs.existsSync(accountsPath())) writeJson(accountsPath(), [])
  if (!fs.existsSync(contactsPath())) writeJson(contactsPath(), [])
  if (!fs.existsSync(signaturesPath())) writeJson(signaturesPath(), [])
  if (!fs.existsSync(settingsPath())) {
    writeJson(settingsPath(), {
      theme: 'light',
      colorPreset: 'blu',
      notificationsEnabled: true,
      pollIntervalSec: 60,
    })
  }
  if (!fs.existsSync(notifyStatePath())) writeJson(notifyStatePath(), {})
}

function listAccounts() {
  return readJson(accountsPath(), [])
}

function getAccount(id) {
  return listAccounts().find((a) => a.id === id) || null
}

function saveAccount(account) {
  const list = listAccounts()
  const idx = list.findIndex((a) => a.id === account.id)
  if (idx >= 0) list[idx] = account
  else list.push(account)
  writeJson(accountsPath(), list)
}

function deleteAccount(id) {
  const safeId = validAccountId(id)
  writeJson(
    accountsPath(),
    listAccounts().filter((a) => a.id !== safeId),
  )
  const dir = path.join(root, 'mail', safeId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  const notify = getNotifyState()
  if (notify[safeId]) {
    delete notify[safeId]
    writeJson(notifyStatePath(), notify)
  }
}

function listMessages(accountId, folder) {
  return readJson(messagesPath(accountId, folder), [])
}

function saveMessages(accountId, folder, messages) {
  const existing = listMessages(accountId, folder)
  const byUid = new Map(existing.map((m) => [m.uid, m]))
  for (const msg of messages) byUid.set(msg.uid, { ...byUid.get(msg.uid), ...msg })
  const merged = [...byUid.values()].sort((a, b) => (b.date || 0) - (a.date || 0))
  writeJson(messagesPath(accountId, folder), merged)
}

function getMessage(accountId, folder, uid) {
  return listMessages(accountId, folder).find((m) => String(m.uid) === String(uid)) || null
}

function setMessageSeen(accountId, folder, uid, seen) {
  const list = listMessages(accountId, folder)
  const idx = list.findIndex((m) => String(m.uid) === String(uid))
  if (idx < 0) return null
  list[idx] = { ...list[idx], seen: Boolean(seen) }
  writeJson(messagesPath(accountId, folder), list)
  return list[idx]
}

function clearMessages(accountId, folder) {
  // Serve per evitare cache locale con stati "non letta" ormai superati.
  try {
    fs.rmSync(messagesPath(accountId, folder), { force: true })
  } catch {
    // ignore
  }
  return true
}

function removeMessages(accountId, folder, uids) {
  const set = new Set((Array.isArray(uids) ? uids : [uids]).map(String))
  const next = listMessages(accountId, folder).filter((m) => !set.has(String(m.uid)))
  writeJson(messagesPath(accountId, folder), next)
  return next
}

function moveMessages(accountId, sourceFolder, destinationFolder, uids, uidMap = {}) {
  const set = new Set((Array.isArray(uids) ? uids : [uids]).map(String))
  const source = listMessages(accountId, sourceFolder)
  const selected = source.filter((message) => set.has(String(message.uid)))
  const remaining = source.filter((message) => !set.has(String(message.uid)))
  const moved = selected
    .map((message) => {
      const destinationUid = uidMap?.[String(message.uid)]
      return destinationUid == null ? null : { ...message, uid: destinationUid }
    })
    .filter(Boolean)

  writeJson(messagesPath(accountId, sourceFolder), remaining)
  if (moved.length) saveMessages(accountId, destinationFolder, moved)
  return { source: remaining, moved }
}

function listContacts() {
  return readJson(contactsPath(), [])
}

function saveContact(input) {
  const list = listContacts()
  const contact = {
    id: input.id || randomUUID(),
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim(),
    notes: String(input.notes || '').trim(),
  }
  const idx = list.findIndex((c) => c.id === contact.id)
  if (idx >= 0) list[idx] = contact
  else list.push(contact)
  writeJson(contactsPath(), list)
  return contact
}

function deleteContact(id) {
  writeJson(
    contactsPath(),
    listContacts().filter((c) => c.id !== id),
  )
  return true
}

function listSignatures() {
  return readJson(signaturesPath(), [])
}

function saveSignature(input) {
  let list = listSignatures()
  const signature = {
    id: input.id || randomUUID(),
    name: String(input.name || '').trim(),
    body: String(input.body || ''),
    isHtml: Boolean(input.isHtml),
    isDefault: Boolean(input.isDefault),
  }
  if (signature.isDefault) {
    list = list.map((s) => ({ ...s, isDefault: false }))
  }
  const idx = list.findIndex((s) => s.id === signature.id)
  if (idx >= 0) list[idx] = signature
  else list.push(signature)
  if (!list.some((s) => s.isDefault) && list.length) {
    list[0].isDefault = true
  }
  writeJson(signaturesPath(), list)
  return signature
}

function clearAccountsSignature(signatureId) {
  const list = listAccounts().map((a) =>
    a.signatureId === signatureId ? { ...a, signatureId: null } : a,
  )
  writeJson(accountsPath(), list)
}

function deleteSignature(id) {
  let list = listSignatures().filter((s) => s.id !== id)
  if (list.length && !list.some((s) => s.isDefault)) {
    list[0].isDefault = true
  }
  writeJson(signaturesPath(), list)
  clearAccountsSignature(id)
  return true
}

function getSettings() {
  return {
    theme: 'light',
    colorPreset: 'blu',
    notificationsEnabled: true,
    pollIntervalSec: 60,
    ...readJson(settingsPath(), {}),
  }
}

function saveSettings(patch) {
  const next = { ...getSettings(), ...patch }
  if (next.theme !== 'dark') next.theme = 'light'
  const allowed = ['blu', 'rosa', 'viola']
  if (!allowed.includes(next.colorPreset)) next.colorPreset = 'blu'
  next.notificationsEnabled = next.notificationsEnabled !== false
  const interval = Number(next.pollIntervalSec)
  next.pollIntervalSec = Number.isFinite(interval) && interval >= 15 ? Math.floor(interval) : 60
  writeJson(settingsPath(), next)
  return next
}

function getNotifyState() {
  return readJson(notifyStatePath(), {})
}

function getAccountNotifyState(accountId) {
  return getNotifyState()[accountId] || { uids: [], initialized: false }
}

function setAccountNotifyState(accountId, data) {
  const all = getNotifyState()
  all[accountId] = {
    uids: Array.isArray(data.uids) ? data.uids.map(Number) : [],
    initialized: Boolean(data.initialized),
  }
  writeJson(notifyStatePath(), all)
  return all[accountId]
}

module.exports = {
  init,
  listAccounts,
  getAccount,
  saveAccount,
  deleteAccount,
  listMessages,
  saveMessages,
  getMessage,
  setMessageSeen,
  clearMessages,
  removeMessages,
  moveMessages,
  listContacts,
  saveContact,
  deleteContact,
  listSignatures,
  saveSignature,
  deleteSignature,
  getSettings,
  saveSettings,
  getNotifyState,
  getAccountNotifyState,
  setAccountNotifyState,
}
