function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (!['https:', 'http:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

module.exports = { safeExternalUrl }
