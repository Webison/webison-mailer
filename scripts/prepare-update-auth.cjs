const fs = require('fs')
const path = require('path')

const token = String(process.env.UPDATE_CHECK_TOKEN || '').trim()
const target = path.join(__dirname, '..', 'electron', 'update-auth.cjs')
fs.writeFileSync(target, `module.exports = { token: ${JSON.stringify(token)} }\n`)
console.log(
  token
    ? 'update-auth.cjs: token iniettato per repo privata'
    : 'update-auth.cjs: nessun UPDATE_CHECK_TOKEN (ok se la repo diventa pubblica)',
)
