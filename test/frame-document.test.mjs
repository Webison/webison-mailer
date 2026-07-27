import assert from 'node:assert/strict'
import test from 'node:test'
import { frameDocument } from '../src/utils/frameDocument.mjs'

test('applica il font di sistema ai frammenti HTML', () => {
  const document = frameDocument('<p>Ciao</p>')
  assert.match(document, /font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif/)
  assert.match(document, /<body><p>Ciao<\/p><\/body>/)
})

test('inserisce lo stile base prima degli stili dichiarati dalla mail', () => {
  const document = frameDocument(
    '<!doctype html><html><head><style>body{font-family:Arial}</style></head><body>Ciao</body></html>',
  )
  assert.ok(document.indexOf('data-webison-frame-defaults') < document.indexOf('font-family:Arial'))
})

test('mantiene vuoto un documento senza contenuto', () => {
  assert.equal(frameDocument(''), '')
})
