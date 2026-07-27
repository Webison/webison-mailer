const SYSTEM_FONT_STYLE =
  '<style data-webison-frame-defaults>body{font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif}</style>'
const EXTERNAL_LINK_BASE = '<base target="_blank">'

export function frameDocument(value) {
  const html = String(value || '')
  if (!html.trim()) return ''

  const headPattern = /<head(?:\s[^>]*)?>/i
  if (headPattern.test(html)) {
    return html.replace(headPattern, (head) => `${head}${EXTERNAL_LINK_BASE}${SYSTEM_FONT_STYLE}`)
  }

  const htmlPattern = /<html(?:\s[^>]*)?>/i
  if (htmlPattern.test(html)) {
    return html.replace(
      htmlPattern,
      (root) => `${root}<head>${EXTERNAL_LINK_BASE}${SYSTEM_FONT_STYLE}</head>`,
    )
  }

  return `<!doctype html><html><head><meta charset="utf-8">${EXTERNAL_LINK_BASE}${SYSTEM_FONT_STYLE}</head><body>${html}</body></html>`
}
