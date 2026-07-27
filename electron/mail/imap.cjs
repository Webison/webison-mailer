const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')

async function withClient(account, fn) {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.username,
      pass: account.password,
    },
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

async function fetchMessages(account, folder = 'INBOX', limit = 50) {
  const leaveOnServer = account.leaveOnServer !== false

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

async function appendToSent(account, { from, to, cc, subject, text, html, messageId }) {
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

    const headers = [
      `From: ${from}`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      messageId ? `Message-ID: ${messageId}` : null,
      'MIME-Version: 1.0',
    ].filter((l) => l !== null)

    let body
    if (html) {
      const boundary = `webison_${Date.now()}`
      body = [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        text || '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        html,
        `--${boundary}--`,
        '',
      ].join('\r\n')
    } else {
      body = [
        ...headers,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        text || '',
      ].join('\r\n')
    }

    await client.append(sentPath, body, ['\\Seen'])
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

module.exports = { listFolders, fetchMessages, appendToSent, checkNewMessages, setMessageSeen, markAllMessagesSeen }
