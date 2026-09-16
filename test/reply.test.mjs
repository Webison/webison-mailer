import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildForwardIntro,
  buildForwardSubject,
  buildReferenceChain,
  buildReplyHtml,
  buildReplyText,
  extractHtmlBody,
  normalizeReferences,
} from '../src/utils/reply.mjs'

test('normalizza e completa la catena References senza duplicati', () => {
  assert.deepEqual(
    buildReferenceChain(['<first@example.test>', '<second@example.test>'], '<second@example.test>'),
    ['<first@example.test>', '<second@example.test>'],
  )
  assert.deepEqual(
    normalizeReferences('<first@example.test> <second@example.test>'),
    ['<first@example.test>', '<second@example.test>'],
  )
})

test('crea una risposta testuale con citazione standard', () => {
  const result = buildReplyText('Risposta\n\n-- \nFirma', 'Mario ha scritto:', 'Prima\nSeconda')
  assert.equal(result, 'Risposta\n\n-- \nFirma\n\nMario ha scritto:\n> Prima\n> Seconda')
})

test('crea la risposta HTML preservando firma e corpo del messaggio citato', () => {
  const result = buildReplyHtml(
    '<p>Risposta</p><div class="signature">Firma</div>',
    'Mario <mario@example.test> ha scritto:',
    '<html><head><style>body{color:red}</style></head><body><p>Messaggio</p></body></html>',
  )
  assert.match(result, /class="signature"/)
  assert.match(result, /Mario &lt;mario@example\.test&gt; ha scritto:/)
  assert.match(result, /<blockquote[^>]*><p>Messaggio<\/p><\/blockquote>/)
  assert.doesNotMatch(result, /body\{color:red\}/)
  assert.equal(extractHtmlBody('<html><body><b>Corpo</b></body></html>'), '<b>Corpo</b>')
  assert.equal(
    extractHtmlBody('<p onclick="alert(1)">Corpo</p><script>alert(1)</script>'),
    '<p>Corpo</p>',
  )
})

test('prefissa l\'oggetto di inoltro con I: senza duplicarlo', () => {
  assert.equal(buildForwardSubject('Ciao'), 'I: Ciao')
  assert.equal(buildForwardSubject('I: Ciao'), 'I: Ciao')
  assert.equal(buildForwardSubject('i: già'), 'i: già')
  assert.equal(buildForwardSubject(''), 'I: ')
})

test('costruisce l\'intro di inoltro con intestazioni e Cc opzionale', () => {
  const withoutCc = buildForwardIntro({
    from: 'Mario <mario@example.test>',
    to: 'Luigi <luigi@example.test>',
    date: '16/09/2026, 14:00',
    subject: 'Ciao',
  })
  assert.equal(
    withoutCc,
    [
      '---------- Messaggio inoltrato ----------',
      'Da: Mario <mario@example.test>',
      'Data: 16/09/2026, 14:00',
      'Oggetto: Ciao',
      'A: Luigi <luigi@example.test>',
    ].join('\n'),
  )

  const withCc = buildForwardIntro({
    from: 'Mario',
    to: 'Luigi',
    cc: 'Peach',
    date: 'oggi',
    subject: 'Test',
  })
  assert.match(withCc, /\nCc: Peach$/)

  const html = buildReplyHtml('<p>Nota</p>', withoutCc, '<p>Corpo</p>')
  assert.match(html, /Messaggio inoltrato ----------<br>Da:/)
})
