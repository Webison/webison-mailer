const nodemailer = require('nodemailer')

async function send(account, { to, cc, subject, text, html, inReplyTo, references }) {
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: {
      user: account.username,
      pass: account.password,
    },
  })

  return transporter.sendMail({
    from: `"${account.name}" <${account.email}>`,
    to,
    cc: cc || undefined,
    subject,
    text,
    html: html || undefined,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  })
}

module.exports = { send }
