const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { randomUUID } = require('node:crypto')

const attachments = require('../electron/mail/attachments.cjs')

const ACCOUNT_ID = '26b52818-ab6e-4a68-a9b0-7c3c3e4dec47'

function withTempRoot(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webison-att-'))
  attachments.init(dir)
  try {
    return run(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('normalizza contentId e riscrive cid in data url', () => {
  withTempRoot(() => {
    assert.equal(attachments.normalizeContentId('<img@webison.local>'), 'img@webison.local')
    const meta = attachments.replaceMessageParts(ACCOUNT_ID, 'INBOX', 42, [
      {
        id: 'att-1',
        filename: 'logo.png',
        contentType: 'image/png',
        contentId: '<logo@webison.local>',
        disposition: 'inline',
        content: Buffer.from('png-bytes'),
      },
    ])
    assert.equal(meta[0].stored, true)
    assert.equal(meta[0].contentId, 'logo@webison.local')

    const html = '<p><img src="cid:logo@webison.local" alt="logo"></p>'
    const rewritten = attachments.rewriteCidHtml(html, meta, (id) =>
      attachments.readPart(ACCOUNT_ID, 'INBOX', 42, id),
    )
    assert.match(rewritten, /^<p><img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="logo"><\/p>$/)
  })
})

test('blocca path traversal sugli id allegato', () => {
  withTempRoot(() => {
    assert.throws(() => attachments.attachmentPath(ACCOUNT_ID, 'INBOX', 1, '../secret'), /non valido/)
    assert.throws(() => attachments.attachmentPath(ACCOUNT_ID, 'INBOX', '..', 'att-1'), /non valido/)
  })
})

test('segna oversize come non stored senza fallire', () => {
  withTempRoot(() => {
    const big = Buffer.alloc(attachments.MAX_ATTACHMENT_BYTES + 1, 1)
    const meta = attachments.replaceMessageParts(ACCOUNT_ID, 'INBOX', 7, [
      {
        id: 'att-1',
        filename: 'huge.bin',
        contentType: 'application/octet-stream',
        content: big,
      },
    ])
    assert.equal(meta[0].stored, false)
    assert.equal(attachments.readPart(ACCOUNT_ID, 'INBOX', 7, 'att-1'), null)
  })
})

test('sposta la cartella allegati quando cambia uid', () => {
  withTempRoot(() => {
    attachments.replaceMessageParts(ACCOUNT_ID, 'INBOX', 10, [
      {
        id: 'att-1',
        filename: 'doc.txt',
        contentType: 'text/plain',
        content: Buffer.from('ciao'),
      },
    ])
    assert.ok(attachments.readPart(ACCOUNT_ID, 'INBOX', 10, 'att-1'))
    attachments.moveForMessage(ACCOUNT_ID, 'INBOX', 'Trash', 10, 99)
    assert.equal(attachments.readPart(ACCOUNT_ID, 'INBOX', 10, 'att-1'), null)
    assert.equal(attachments.readPart(ACCOUNT_ID, 'Trash', 99, 'att-1').toString(), 'ciao')
  })
})

test('converte data url immagini in allegati inline cid', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex')
  const html = `<p><img src="data:image/png;base64,${png.toString('base64')}"></p>`
  const { html: next, inline } = attachments.extractDataUrlImages(html)
  assert.equal(inline.length, 1)
  assert.equal(inline[0].contentType, 'image/png')
  assert.match(next, /cid:inline-[^"']+@webison\.local/)
})

test('staging allegati espone solo metadati e legge il buffer', () => {
  withTempRoot(() => {
    const file = path.join(os.tmpdir(), `webison-stage-${randomUUID()}.txt`)
    fs.writeFileSync(file, 'payload-stage')
    try {
      const meta = attachments.addStagingFile(file)
      assert.ok(meta.stagingId)
      assert.equal(meta.filename.endsWith('.txt'), true)
      assert.equal(meta.size, Buffer.byteLength('payload-stage'))
      const loaded = attachments.readStagingContent(meta.stagingId)
      assert.equal(loaded.content.toString(), 'payload-stage')
      attachments.clearStaging([meta.stagingId])
      assert.throws(() => attachments.readStagingContent(meta.stagingId), /non trovato/)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})
