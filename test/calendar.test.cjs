const assert = require('node:assert/strict')
const test = require('node:test')
const {
  isCalendarAttachment,
  parseIcsSummary,
} = require('../electron/mail/calendar.cjs')

test('riconosce allegati calendario da MIME o estensione', () => {
  assert.equal(isCalendarAttachment({ contentType: 'text/calendar; method=REQUEST', filename: 'invite.ics' }), true)
  assert.equal(isCalendarAttachment({ contentType: 'application/ics', filename: 'a.bin' }), true)
  assert.equal(isCalendarAttachment({ contentType: 'application/octet-stream', filename: 'meeting.ICS' }), true)
  assert.equal(isCalendarAttachment({ contentType: 'application/pdf', filename: 'doc.pdf' }), false)
})

test('estrae riepilogo da invito Google Meet', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'SUMMARY:Standup team',
    'DTSTART:20260921T100000Z',
    'DTEND:20260921T103000Z',
    'LOCATION:Google Meet',
    'DESCRIPTION:Join: https://meet.google.com/abc-defg-hij\\nAltro testo',
    'URL:https://meet.google.com/abc-defg-hij',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const summary = parseIcsSummary(ics)
  assert.equal(summary.method, 'REQUEST')
  assert.equal(summary.summary, 'Standup team')
  assert.equal(summary.location, 'Google Meet')
  assert.equal(summary.meetingUrl, 'https://meet.google.com/abc-defg-hij')
  assert.match(summary.when, /21/)
  assert.match(summary.when, /\d{2}:\d{2}/)
  assert.ok(summary.startAt)
})

test('gestisce folding ICS, DATE all-day e link Teams', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Offsite',
    'DTSTART;VALUE=DATE:20261001',
    'DTEND;VALUE=DATE:20261002',
    'DESCRIPTION:Partecipa con Microsoft Teams: https://teams.microsoft.com/l/meetup-',
    ' join/19%3ameeting',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const summary = parseIcsSummary(ics)
  assert.equal(summary.summary, 'Offsite')
  assert.equal(summary.allDay, true)
  assert.match(summary.when, /tutto il giorno/)
  assert.match(summary.meetingUrl, /teams\.microsoft\.com/)
})

test('estrae link Zoom da LOCATION', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Demo',
    'DTSTART:20260921T150000',
    'DTEND:20260921T160000',
    'LOCATION:https://zoom.us/j/123456789',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n')

  const summary = parseIcsSummary(ics)
  assert.equal(summary.meetingUrl, 'https://zoom.us/j/123456789')
  assert.equal(summary.location, 'https://zoom.us/j/123456789')
})
