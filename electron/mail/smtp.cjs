const nodemailer = require('nodemailer')

const TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
}

function createTransport(account) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    ...TIMEOUTS,
    auth: {
      user: account.username,
      pass: account.password,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

async function verify(account) {
  const transporter = createTransport(account)
  try {
    await transporter.verify()
    return true
  } finally {
    transporter.close()
  }
}

async function send(account, { to, cc, subject, text, html, inReplyTo, references }) {
  const transporter = createTransport(account)
  try {
    return await transporter.sendMail({
      from: `"${account.name}" <${account.email}>`,
      to,
      cc: cc || undefined,
      subject,
      text,
      html: html || undefined,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined,
    })
  } finally {
    transporter.close()
  }
}

module.exports = { createTransport, send, verify }
