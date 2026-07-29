export function normalizeReferences(value) {
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

export function buildReferenceChain(references, messageId) {
  return normalizeReferences([references, messageId])
}

export function quotePlainText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

export function extractHtmlBody(value) {
  const html = String(value || '').trim()
  if (!html) return ''
  const body = html.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)
  const fragment = body
    ? body[1]
    : html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html(?:\s[^>]*)?>/gi, '')
    .replace(/<head(?:\s[^>]*)?>[\s\S]*?<\/head>/gi, '')
    .trim()
  return fragment
    .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, '')
    .replace(/<(?:iframe|object|form)(?:\s[^>]*)?>[\s\S]*?<\/(?:iframe|object|form)>/gi, '')
    .replace(/<embed(?:\s[^>]*)?\/?>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildReplyText(replyText, intro, quotedText) {
  const reply = String(replyText || '').trimEnd()
  const quote = quotePlainText(quotedText)
  return [reply, `${intro}\n${quote}`].filter(Boolean).join('\n\n')
}

export function buildReplyHtml(replyHtml, intro, quotedHtml) {
  const quote = extractHtmlBody(quotedHtml)
  return [
    String(replyHtml || '').trim(),
    '<div class="webison-reply-quote">',
    `<p>${escapeHtml(intro)}</p>`,
    `<blockquote style="margin:0 0 0 .8em;padding-left:1em;border-left:2px solid #c7c7c7">${quote}</blockquote>`,
    '</div>',
  ].join('')
}
