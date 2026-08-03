const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')
const MailComposer = require('nodemailer/lib/mail-composer')
const attachments = require('./attachments.cjs')

async function withClient(account, fn) {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.username,
      pass: account.password,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: false,
  })

  await client.connect()
  try {
    return await fn(client)
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

async function verify(account) {
  return withClient(account, async () => true)
}

async function listFolders(account) {
  return withClient(account, async (client) => {
    const boxes = await client.list()
    return boxes.map((box) => ({
      path: box.path,
      name: box.name,
      specialUse: box.specialUse || null,
    }))
  })
}

function addrList(value) {
  if (!value?.value?.length) return ''
  return value.value.map((a) => a.address || a.name).filter(Boolean).join(', ')
}

function normalizeReferences(value) {
  const values = Array.isArray(value) ? value.flat(Infinity) : [value]
  const references = []
  const seen = new Set()
  for (const item of values) {
    const raw = String(item || '').trim()
    if (!raw) continue
    const matches = raw.match(/<[^<>\s]+>/g) || raw.split(/\s+/)
    for (const match of matches) {
      const reference = match.trim()
      if (!reference || seen.has(reference)) continue
      seen.add(reference)
      references.push(reference)
    }
  }
  return references
}

async function fetchMessages(account, folder = 'INBOX', limit = 50, options = {}) {
  const leaveOnServer = account.leaveOnServer !== false
  const accountId = options.accountId || account.id
  const storeFolder = options.storeAs || folder

  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      const total = client.mailbox.exists || 0
      if (!total) return []

      const from = Math.max(1, total - limit + 1)
      const messages = []
      const fetchedUids = []

      for await (const msg of client.fetch(`${from}:*`, {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      })) {
        let parsed
        try {
          parsed = await simpleParser(msg.source)
        } catch {
          parsed = null
        }

        const envelope = msg.envelope || {}
        fetchedUids.push(msg.uid)

        let attachmentMeta = []
        if (accountId && parsed?.attachments?.length) {
          try {
            attachmentMeta = attachments.replaceMessageParts(
              accountId,
              storeFolder,
              msg.uid,
              parsed.attachments.map((part, index) => ({
                id: `att-${index + 1}`,
                filename: part.filename,
                contentType: part.contentType,
                contentId: part.contentId || part.cid,
                disposition: part.contentDisposition || part.disposition,
                content: part.content,
                index,
              })),
            )
          } catch {
            attachmentMeta = []
          }
        } else if (accountId) {
          try {
            attachments.deleteForMessage(accountId, storeFolder, msg.uid)
          } catch {
            // ignore
          }
        }

        messages.push({
          uid: msg.uid,
          subject: parsed?.subject || envelope.subject || '(senza oggetto)',
          from: parsed?.from ? addrList(parsed.from) : (envelope.from || []).map((a) => a.address || a.name).join(', '),
          to: parsed?.to ? addrList(parsed.to) : (envelope.to || []).map((a) => a.address || a.name).join(', '),
          cc: parsed?.cc ? addrList(parsed.cc) : (envelope.cc || []).map((a) => a.address || a.name).join(', '),
          date: (parsed?.date || envelope.date || new Date()).getTime(),
          seen: msg.flags?.has('\\Seen') || false,
          text: parsed?.text || '',
          html: typeof parsed?.html === 'string' ? parsed.html : '',
          messageId: parsed?.messageId || envelope.messageId || null,
          inReplyTo: parsed?.inReplyTo || null,
          references: normalizeReferences(parsed?.references),
          attachments: attachmentMeta,
        })
      }

      // Di default lascia copia sul server; solo se disattivato elimina dopo il download
      if (!leaveOnServer && fetchedUids.length) {
        await client.messageDelete(fetchedUids.join(','), { uid: true })
      }

      return messages.sort((a, b) => b.date - a.date)
    } finally {
      lock.release()
    }
  })
}

async function appendToSent(account, {
  from,
  to,
  cc,
  subject,
  text,
  html,
  messageId,
  inReplyTo,
  references,
  attachments: mailAttachments = [],
}) {
  return withClient(account, async (client) => {
    const boxes = await client.list()
    let sentPath = null
    for (const box of boxes) {
      if (box.specialUse === '\\Sent') {
        sentPath = box.path
        break
      }
      const name = (box.name || box.path || '').toLowerCase()
      if (!sentPath && (name === 'sent' || name === 'inviate' || name.includes('sent'))) {
        sentPath = box.path
      }
    }
    if (!sentPath) return null

    const referenceList = normalizeReferences(references)
    const composer = new MailComposer({
      from,
      to,
      cc: cc || undefined,
      subject,
      text: text || '',
      html: html || undefined,
      messageId: messageId || undefined,
      inReplyTo: inReplyTo || undefined,
      references: referenceList.length ? referenceList : undefined,
      attachments: Array.isArray(mailAttachments) ? mailAttachments : [],
    })
    const built = await composer.compile().build()
    await client.append(sentPath, built, ['\\Seen'])
    return sentPath
  })
}

async function checkNewMessages(account, folder = 'INBOX', limit = 30) {
  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      const total = client.mailbox.exists || 0
      if (!total) return []

      const from = Math.max(1, total - limit + 1)
      const messages = []

      for await (const msg of client.fetch(`${from}:*`, {
        uid: true,
        flags: true,
        envelope: true,
      })) {
        const envelope = msg.envelope || {}
        messages.push({
          uid: msg.uid,
          subject: envelope.subject || '(senza oggetto)',
          from: (envelope.from || []).map((a) => a.address || a.name).filter(Boolean).join(', '),
          date: (envelope.date || new Date()).getTime(),
          seen: msg.flags?.has('\\Seen') || false,
        })
      }

      return messages.sort((a, b) => b.date - a.date)
    } finally {
      lock.release()
    }
  })
}

async function setMessageSeen(account, folder, uid, seen) {
  if (String(uid).startsWith('local-')) return true

  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      if (seen) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      } else {
        await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
      }
      return true
    } finally {
      lock.release()
    }
  })
}

async function markAllMessagesSeen(account, folder = 'INBOX', seen = true) {
  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      const range = '1:*'
      if (seen) {
        await client.messageFlagsAdd(range, ['\\Seen'])
      } else {
        await client.messageFlagsRemove(range, ['\\Seen'])
      }
      return true
    } finally {
      lock.release()
    }
  })
}

async function resolveTrashPath(client) {
  const boxes = await client.list()
  const bySpecial = boxes.find((box) => box.specialUse === '\\Trash')
  if (bySpecial) return bySpecial.path

  const byName = boxes.find((box) => {
    const name = (box.name || box.path || '').toLowerCase()
    return (
      name === 'trash' ||
      name === 'cestino' ||
      name === 'bin' ||
      name === 'deleted' ||
      name === 'deleted items' ||
      name.includes('trash') ||
      name.includes('cestino')
    )
  })
  return byName?.path || null
}

function uidRange(uids) {
  return uids.map(String).join(',')
}

function serializeUidMap(uidMap) {
  if (!(uidMap instanceof Map)) return null
  return Object.fromEntries([...uidMap].map(([source, destination]) => [String(source), destination]))
}

async function deleteMessagesWithClient(client, folder, list, { permanent = false } = {}) {
  const trashPath = permanent ? null : await resolveTrashPath(client)
  const inTrash = Boolean(trashPath && trashPath === folder)
  if (!permanent && !inTrash && !trashPath) {
    throw new Error('Cartella Cestino non trovata sul server. Il messaggio non è stato eliminato.')
  }
  const doPermanent = Boolean(permanent) || inTrash

  const lock = await client.getMailboxLock(folder)
  try {
    if (doPermanent) {
      const deleted = await client.messageDelete(uidRange(list), { uid: true })
      if (deleted === false) throw new Error('Il server non ha confermato la cancellazione dei messaggi')
      return { trashed: false, permanent: true, trashPath }
    }
    const moved = await client.messageMove(uidRange(list), trashPath, { uid: true })
    if (!moved) throw new Error('Il server non ha confermato lo spostamento nel Cestino')
    return {
      trashed: true,
      permanent: false,
      trashPath,
      uidMap: serializeUidMap(moved.uidMap),
    }
  } finally {
    lock.release()
  }
}

async function deleteMessages(account, folder, uids, { permanent = false } = {}) {
  const list = (Array.isArray(uids) ? uids : [uids]).filter((u) => u != null && !String(u).startsWith('local-'))
  if (!list.length) return { trashed: false, permanent: false }

  return withClient(account, async (client) => {
    return deleteMessagesWithClient(client, folder, list, { permanent })
  })
}

async function emptyTrash(account) {
  return withClient(account, async (client) => {
    const trashPath = await resolveTrashPath(client)
    if (!trashPath) throw new Error('Cartella Cestino non trovata sul server')

    const lock = await client.getMailboxLock(trashPath)
    try {
      if (client.mailbox.exists) {
        await client.messageDelete('1:*')
      }
      return trashPath
    } finally {
      lock.release()
    }
  })
}

module.exports = {
  listFolders,
  fetchMessages,
  appendToSent,
  checkNewMessages,
  setMessageSeen,
  markAllMessagesSeen,
  deleteMessages,
  deleteMessagesWithClient,
  emptyTrash,
  resolveTrashPath,
  verify,
}
