function configError(message) {
  const err = new Error(`Configurazione non valida: ${message}`)
  err.code = 'INVALID_CONFIG'
  return err
}

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw configError(`${label} è un campo obbligatorio`)
  return text
}

function validHost(value, label) {
  const host = requiredText(value, label)
  if (host.length > 253 || !/^(?=.{1,253}$)(?!-)[a-z0-9.-]+(?<!-)$/i.test(host)) {
    throw configError(`${label} non è valido`)
  }
  return host
}

function validPort(value, label) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw configError(`${label} deve essere compresa tra 1 e 65535`)
  }
  return port
}

function validAccountId(value, { optional = false } = {}) {
  if ((value == null || value === '') && optional) return null
  const id = String(value || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw configError('identificativo account non valido')
  }
  return id
}

function normalizeAccountInput(input = {}, { requireIdentity = true } = {}) {
  const normalized = {
    id: validAccountId(input.id, { optional: true }),
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim(),
    username: requiredText(input.username || input.email, 'Username'),
    password: String(input.password || ''),
    imapHost: validHost(input.imapHost, 'Host IMAP'),
    imapPort: validPort(input.imapPort, 'Porta IMAP'),
    imapSecure: input.imapSecure !== false,
    smtpHost: validHost(input.smtpHost, 'Host SMTP'),
    smtpPort: validPort(input.smtpPort, 'Porta SMTP'),
    smtpSecure: Boolean(input.smtpSecure),
    leaveOnServer: input.leaveOnServer !== false,
    signatureId: input.signatureId || null,
  }
  if (requireIdentity) {
    normalized.name = requiredText(input.name, 'Nome')
    normalized.email = requiredText(input.email, 'Email')
  }
  return normalized
}

module.exports = {
  configError,
  normalizeAccountInput,
  validAccountId,
}
