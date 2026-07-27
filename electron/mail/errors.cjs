const SAFE_CODES = new Set([
  'AUTH_FAILED',
  'CERT_INVALID',
  'CONNECTION_REFUSED',
  'CONNECTION_TIMEOUT',
  'DNS_NOT_FOUND',
  'GREETING_TIMEOUT',
  'INVALID_CONFIG',
  'SERVER_ERROR',
  'TLS_ERROR',
  'UNKNOWN',
])

function cleanService(value) {
  return String(value || 'MAIL').toUpperCase() === 'SMTP' ? 'SMTP' : 'IMAP'
}

function cleanHost(value) {
  const host = String(value || '').trim()
  return /^[a-z0-9.-]+$/i.test(host) ? host : 'server non valido'
}

function cleanPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 0
}

function rawError(err) {
  return `${err?.code || ''} ${err?.responseCode || ''} ${err?.command || ''} ${err?.message || err || ''}`.toLowerCase()
}

function classifyCode(err) {
  const raw = rawError(err)
  if (err?.code === 'INVALID_CONFIG' || /configurazione non valida|campo obbligatorio/.test(raw)) {
    return 'INVALID_CONFIG'
  }
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN' || /getaddrinfo|dns/.test(raw)) {
    return 'DNS_NOT_FOUND'
  }
  if (err?.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED'
  if (
    err?.code === 'GREETING_TIMEOUT' ||
    /greeting never received|failed to receive greeting|saluto/.test(raw)
  ) {
    return 'GREETING_TIMEOUT'
  }
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKETTIMEDOUT' || /timed? ?out|timeout/.test(raw)) {
    return 'CONNECTION_TIMEOUT'
  }
  if (
    err?.code === 'EAUTH' ||
    err?.responseCode === 535 ||
    /authentication failed|invalid credentials|login failed|authent/.test(raw)
  ) {
    return 'AUTH_FAILED'
  }
  if (
    /self[- ]signed|certificate has expired|unable to verify|hostname.*certificate|cert_/.test(raw)
  ) {
    return 'CERT_INVALID'
  }
  if (/ssl|tls|wrong version number|secure connection/.test(raw)) return 'TLS_ERROR'
  if (err?.responseCode || /^[45]\d\d\b/.test(String(err?.message || ''))) return 'SERVER_ERROR'
  return 'UNKNOWN'
}

function advice(code, service) {
  switch (code) {
    case 'INVALID_CONFIG':
      return 'Controlla host, porta, username e password nelle impostazioni account.'
    case 'DNS_NOT_FOUND':
      return 'Il nome del server non è risolvibile. Controlla l’host e la connessione Internet.'
    case 'CONNECTION_REFUSED':
      return 'Il server rifiuta la porta configurata. Controlla porta, TLS e regole firewall.'
    case 'GREETING_TIMEOUT':
      return `Il server ${service} non ha risposto dopo la connessione. Controlla firewall, VPN, antivirus e blocchi del provider sulla porta.`
    case 'CONNECTION_TIMEOUT':
      return 'Il server non è raggiungibile entro il tempo previsto. Controlla rete, firewall, VPN e porta.'
    case 'AUTH_FAILED':
      return 'Il server è raggiungibile ma ha rifiutato le credenziali. Controlla username e password.'
    case 'CERT_INVALID':
      return 'Il certificato TLS del server non è valido per questo host. Non disattivare la verifica del certificato.'
    case 'TLS_ERROR':
      return 'La negoziazione TLS è fallita. Controlla la modalità SSL/TLS associata alla porta.'
    case 'SERVER_ERROR':
      return 'Il server ha restituito un errore. Riprova e, se persiste, verifica lo stato del provider.'
    default:
      return 'La connessione non è riuscita. Verifica i parametri account o usa “Verifica connessione”.'
  }
}

function mailErrorInfo(err, context = {}) {
  const service = cleanService(context.service)
  const host = cleanHost(context.host)
  const port = cleanPort(context.port)
  const tls = Boolean(context.secure)
  const code = classifyCode(err)
  const endpoint = port ? `${host}:${port}` : host
  const phase = String(context.phase || 'connessione').replace(/[^a-zà-ù0-9 _-]/gi, '').trim()
  const prefix = `${service} ${endpoint} (${tls ? 'SSL/TLS' : 'STARTTLS/non cifrato'})`
  return {
    ok: false,
    code: SAFE_CODES.has(code) ? code : 'UNKNOWN',
    message: `${prefix}: errore durante ${phase || 'connessione'}. ${advice(code, service)}`,
    endpoint,
    tls,
  }
}

function mailSuccessInfo(context = {}) {
  const service = cleanService(context.service)
  const host = cleanHost(context.host)
  const port = cleanPort(context.port)
  const tls = Boolean(context.secure)
  const endpoint = port ? `${host}:${port}` : host
  return {
    ok: true,
    code: 'OK',
    message: `${service} ${endpoint}: connessione e autenticazione riuscite.`,
    endpoint,
    tls,
  }
}

function asFriendlyError(err, context) {
  const info = mailErrorInfo(err, context)
  const wrapped = new Error(`${info.message} [${info.code}]`)
  wrapped.code = info.code
  return wrapped
}

module.exports = {
  asFriendlyError,
  classifyCode,
  mailErrorInfo,
  mailSuccessInfo,
}
