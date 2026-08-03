const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { validAccountId } = require('./validation.cjs')

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_ATTACHMENTS = 20
const MAX_INLINE_DISPLAY_BYTES = 2 * 1024 * 1024

let root = ''
const staging = new Map()

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function init(userDataPath) {
  root = path.join(userDataPath, 'webison-data')
  ensureDir(path.join(root, 'mail'))
}

function safeFolderName(folder) {
  let safe = String(folder || 'INBOX').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  if (safe === '.' || safe === '..') safe = `_${safe.replace(/\./g, 'dot')}`
  return safe
}

function safeUidName(uid) {
  const value = String(uid ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  if (!value || value === '.' || value === '..') {
    throw new Error('Identificativo messaggio non valido')
  }
  return value
}

function safeAttachmentId(id) {
  const value = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!value || value === '.' || value === '..' || value.includes('..')) {
    throw new Error('Identificativo allegato non valido')
  }
  return value
}

function mailboxDir(accountId, folder) {
  const id = validAccountId(accountId)
  const mailRoot = path.resolve(root, 'mail')
  const target = path.resolve(mailRoot, id, safeFolderName(folder))
  const prefix = `${mailRoot}${path.sep}`.toLowerCase()
  if (!target.toLowerCase().startsWith(prefix)) {
    throw new Error('Percorso mailbox non valido')
  }
  return target
}

function attachmentDir(accountId, folder, uid) {
  const dir = path.join(mailboxDir(accountId, folder), 'attachments', safeUidName(uid))
  const mailbox = mailboxDir(accountId, folder)
  const prefix = `${mailbox}${path.sep}`.toLowerCase()
  if (!path.resolve(dir).toLowerCase().startsWith(prefix)) {
    throw new Error('Percorso allegati non valido')
  }
  return dir
}

function attachmentPath(accountId, folder, uid, attachmentId) {
  const dir = attachmentDir(accountId, folder, uid)
  const file = path.join(dir, safeAttachmentId(attachmentId))
  const prefix = `${dir}${path.sep}`.toLowerCase()
  if (!path.resolve(file).toLowerCase().startsWith(prefix)) {
    throw new Error('Percorso allegato non valido')
  }
  return file
}

function normalizeContentId(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  return raw.replace(/^<|>$/g, '').trim() || null
}

function sanitizeFilename(name, index = 0, contentType = '') {
  let base = String(name || '').split(/[/\\]/).pop() || ''
  base = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim()
  if (!base || base === '.' || base === '..') {
    const ext = extensionForType(contentType)
    base = `allegato-${index + 1}${ext}`
  }
  return base.slice(0, 180)
}

function extensionForType(contentType) {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('png')) return '.png'
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg'
  if (type.includes('gif')) return '.gif'
  if (type.includes('webp')) return '.webp'
  if (type.includes('pdf')) return '.pdf'
  if (type.includes('html')) return '.html'
  if (type.includes('plain')) return '.txt'
  return ''
}

function normalizeDisposition(value) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('inline')) return 'inline'
  if (raw.includes('attachment')) return 'attachment'
  return null
}

function deleteForMessage(accountId, folder, uid) {
  const dir = attachmentDir(accountId, folder, uid)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function deleteForMessages(accountId, folder, uids) {
  for (const uid of uids || []) {
    try {
      deleteForMessage(accountId, folder, uid)
    } catch {
      // ignore path errors on cleanup
    }
  }
}

function clearFolderAttachments(accountId, folder) {
  const dir = path.join(mailboxDir(accountId, folder), 'attachments')
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function moveForMessage(accountId, sourceFolder, destinationFolder, sourceUid, destinationUid) {
  if (sourceUid == null || destinationUid == null) return false
  const source = attachmentDir(accountId, sourceFolder, sourceUid)
  if (!fs.existsSync(source)) return false
  const target = attachmentDir(accountId, destinationFolder, destinationUid)
  ensureDir(path.dirname(target))
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(source, target)
  return true
}

function savePart(accountId, folder, uid, meta, content) {
  const id = safeAttachmentId(meta.id || randomUUID())
  const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content || '')
  const filename = sanitizeFilename(meta.filename, meta.index || 0, meta.contentType)
  const contentType = String(meta.contentType || 'application/octet-stream')
  const contentId = normalizeContentId(meta.contentId)
  const disposition = normalizeDisposition(meta.disposition)

  if (size > MAX_ATTACHMENT_BYTES) {
    return {
      id,
      filename,
      contentType,
      size,
      contentId,
      disposition,
      stored: false,
    }
  }

  const file = attachmentPath(accountId, folder, uid, id)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content)
  return {
    id,
    filename,
    contentType,
    size,
    contentId,
    disposition,
    stored: true,
  }
}

function replaceMessageParts(accountId, folder, uid, parts) {
  deleteForMessage(accountId, folder, uid)
  const list = []
  const items = Array.isArray(parts) ? parts.slice(0, MAX_ATTACHMENTS) : []
  items.forEach((part, index) => {
    const content = part.content
    if (!Buffer.isBuffer(content) && typeof content !== 'string') {
      list.push({
        id: safeAttachmentId(part.id || `att-${index + 1}`),
        filename: sanitizeFilename(part.filename, index, part.contentType),
        contentType: String(part.contentType || 'application/octet-stream'),
        size: Number(part.size) || 0,
        contentId: normalizeContentId(part.contentId),
        disposition: normalizeDisposition(part.disposition),
        stored: false,
      })
      return
    }
    list.push(savePart(accountId, folder, uid, { ...part, index }, content))
  })
  return list
}

function readPart(accountId, folder, uid, attachmentId) {
  const file = attachmentPath(accountId, folder, uid, attachmentId)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file)
}

function copyPartTo(accountId, folder, uid, attachmentId, destinationPath) {
  const file = attachmentPath(accountId, folder, uid, attachmentId)
  if (!fs.existsSync(file)) throw new Error('Allegato non trovato')
  fs.copyFileSync(file, destinationPath)
  return true
}

function rewriteCidHtml(html, attachments, reader) {
  const source = String(html || '')
  if (!source || !attachments?.length) return source

  const byCid = new Map()
  for (const att of attachments) {
    const cid = normalizeContentId(att.contentId)
    if (cid) byCid.set(cid.toLowerCase(), att)
  }
  if (!byCid.size) return source

  return source.replace(/(['"])cid:([^'"]+)\1/gi, (match, quote, rawCid) => {
    const cid = normalizeContentId(rawCid)
    if (!cid) return match
    const att = byCid.get(cid.toLowerCase())
    if (!att?.stored || !att.id) return match
    if ((att.size || 0) > MAX_INLINE_DISPLAY_BYTES) return match
    let buffer
    try {
      buffer = reader(att.id)
    } catch {
      return match
    }
    if (!buffer) return match
    const type = att.contentType || 'application/octet-stream'
    return `${quote}data:${type};base64,${buffer.toString('base64')}${quote}`
  })
}

function messageWithDisplayHtml(message, accountId, folder) {
  if (!message) return null
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  const html = rewriteCidHtml(message.html || '', attachments, (id) =>
    readPart(accountId, folder, message.uid, id),
  )
  return { ...message, html, attachments }
}

function listDownloadableAttachments(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments.filter((att) => att?.stored)
}

function hasListAttachmentIndicator(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  if (!attachments.length) return false
  const html = String(message.html || '')
  return attachments.some((att) => {
    if (att.disposition === 'attachment') return true
    const cid = normalizeContentId(att.contentId)
    if (!cid) return true
    if (att.disposition === 'inline' && html.toLowerCase().includes(`cid:${cid.toLowerCase()}`)) {
      return false
    }
    return true
  })
}

function extractDataUrlImages(html) {
  const source = String(html || '')
  const inline = []
  let index = 0
  const nextHtml = source.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(['"])(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)\2/gi,
    (match, prefix, quote, dataUrl) => {
      if (inline.length >= MAX_ATTACHMENTS) return match
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) return match
      if (parsed.content.length > MAX_ATTACHMENT_BYTES) return match
      index += 1
      const cid = `inline-${randomUUID()}@webison.local`
      inline.push({
        filename: `immagine-${index}${extensionForType(parsed.contentType)}`,
        contentType: parsed.contentType,
        content: parsed.content,
        cid,
        contentDisposition: 'inline',
      })
      return `${prefix}${quote}cid:${cid}${quote}`
    },
  )
  return { html: nextHtml, inline }
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  try {
    const content = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
    return { contentType: match[1].toLowerCase(), content }
  } catch {
    return null
  }
}

function addStagingFile(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('File allegato non valido')
  }
  const stat = fs.statSync(resolved)
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Allegato troppo grande (max ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`)
  }
  const id = randomUUID()
  const filename = sanitizeFilename(path.basename(resolved))
  const entry = {
    id,
    path: resolved,
    filename,
    size: stat.size,
    contentType: guessContentType(filename),
  }
  staging.set(id, entry)
  return {
    stagingId: id,
    filename: entry.filename,
    size: entry.size,
    contentType: entry.contentType,
  }
}

function getStaging(id) {
  return staging.get(String(id)) || null
}

function removeStaging(id) {
  staging.delete(String(id))
}

function clearStaging(ids) {
  if (!ids) {
    staging.clear()
    return
  }
  for (const id of ids) staging.delete(String(id))
}

function readStagingContent(id) {
  const entry = getStaging(id)
  if (!entry) throw new Error('Allegato temporaneo non trovato')
  const content = fs.readFileSync(entry.path)
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Allegato troppo grande (max ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`)
  }
  return { ...entry, content }
}

function guessContentType(filename) {
  const ext = path.extname(filename || '').toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.txt') return 'text/plain'
  if (ext === '.html' || ext === '.htm') return 'text/html'
  if (ext === '.zip') return 'application/zip'
  return 'application/octet-stream'
}

function assertAttachmentLimits(count) {
  if (count > MAX_ATTACHMENTS) {
    throw new Error(`Massimo ${MAX_ATTACHMENTS} allegati per messaggio`)
  }
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_INLINE_DISPLAY_BYTES,
  init,
  mailboxDir,
  attachmentDir,
  attachmentPath,
  normalizeContentId,
  sanitizeFilename,
  deleteForMessage,
  deleteForMessages,
  clearFolderAttachments,
  moveForMessage,
  savePart,
  replaceMessageParts,
  readPart,
  copyPartTo,
  rewriteCidHtml,
  messageWithDisplayHtml,
  listDownloadableAttachments,
  hasListAttachmentIndicator,
  extractDataUrlImages,
  addStagingFile,
  getStaging,
  removeStaging,
  clearStaging,
  readStagingContent,
  assertAttachmentLimits,
}
