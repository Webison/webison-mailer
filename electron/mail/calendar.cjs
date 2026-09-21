function isCalendarAttachment(att) {
  if (!att) return false
  const type = String(att.contentType || '').toLowerCase()
  const name = String(att.filename || '').toLowerCase()
  return (
    type.includes('text/calendar') ||
    type.includes('application/ics') ||
    name.endsWith('.ics')
  )
}

function unfoldIcs(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
}

function unescapeIcsText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function parseIcsProperties(icsText) {
  const lines = unfoldIcs(icsText).split('\n')
  const props = []
  for (const line of lines) {
    if (!line || line.startsWith(' ')) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const left = line.slice(0, sep)
    const value = line.slice(sep + 1)
    const parts = left.split(';')
    const name = String(parts[0] || '')
      .trim()
      .toUpperCase()
    if (!name) continue
    const params = {}
    for (const part of parts.slice(1)) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      params[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim()
    }
    props.push({ name, params, value })
  }
  return props
}

function firstProp(props, name, { inEvent = true } = {}) {
  let inVevent = false
  for (const prop of props) {
    if (prop.name === 'BEGIN' && String(prop.value).toUpperCase() === 'VEVENT') {
      inVevent = true
      continue
    }
    if (prop.name === 'END' && String(prop.value).toUpperCase() === 'VEVENT') {
      inVevent = false
      continue
    }
    if (prop.name !== name) continue
    if (inEvent && !inVevent && name !== 'METHOD') continue
    if (!inEvent && inVevent) continue
    return prop
  }
  return null
}

function parseIcsDate(prop) {
  if (!prop?.value) return null
  const raw = String(prop.value).trim()
  const isDateOnly = String(prop.params?.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(raw)
  if (isDateOnly) {
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    return {
      date: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0)),
      allDay: true,
      utc: true,
    }
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const utc = Boolean(m[7])
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])
  const date = utc
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second)
  return { date, allDay: false, utc }
}

const MEETING_URL_RE =
  /https?:\/\/(?:[\w.-]+\.)?(?:meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|zoom\.us|zoom\.com)[^\s<>"']*/gi

function extractUrls(text) {
  const value = String(text || '')
  const matches = value.match(MEETING_URL_RE) || []
  return matches.map((url) => url.replace(/[),.;]+$/g, ''))
}

function pickMeetingUrl(...texts) {
  for (const text of texts) {
    const urls = extractUrls(text)
    if (urls.length) return urls[0]
  }
  const plain = String(texts.find(Boolean) || '').trim()
  if (/^https?:\/\//i.test(plain)) return plain.split(/\s+/)[0]
  return ''
}

function formatEventWhen(start, end) {
  if (!start?.date || Number.isNaN(start.date.getTime())) return ''
  if (start.allDay) {
    const day = start.date.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    if (end?.date && !Number.isNaN(end.date.getTime())) {
      const endDay = new Date(end.date.getTime() - 86400000)
      if (endDay.toISOString().slice(0, 10) !== start.date.toISOString().slice(0, 10)) {
        const endLabel = endDay.toLocaleDateString('it-IT', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
        return `${day} – ${endLabel} (tutto il giorno)`
      }
    }
    return `${day} (tutto il giorno)`
  }
  const opts = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
  const startLabel = start.date.toLocaleString('it-IT', opts)
  if (!end?.date || Number.isNaN(end.date.getTime())) return startLabel
  const sameDay =
    start.date.toDateString() === end.date.toDateString()
  if (sameDay) {
    const endTime = end.date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    return `${startLabel} – ${endTime}`
  }
  return `${startLabel} – ${end.date.toLocaleString('it-IT', opts)}`
}

function parseIcsSummary(icsText) {
  const props = parseIcsProperties(icsText)
  const methodProp = props.find((p) => p.name === 'METHOD')
  const summaryProp = firstProp(props, 'SUMMARY')
  const locationProp = firstProp(props, 'LOCATION')
  const urlProp = firstProp(props, 'URL')
  const descriptionProp = firstProp(props, 'DESCRIPTION')
  const start = parseIcsDate(firstProp(props, 'DTSTART'))
  const end = parseIcsDate(firstProp(props, 'DTEND'))

  const summary = unescapeIcsText(summaryProp?.value || '').trim()
  const location = unescapeIcsText(locationProp?.value || '').trim()
  const description = unescapeIcsText(descriptionProp?.value || '').trim()
  const url = unescapeIcsText(urlProp?.value || '').trim()
  const meetingUrl = pickMeetingUrl(url, location, description)

  return {
    method: String(methodProp?.value || '').trim().toUpperCase() || null,
    summary: summary || 'Evento calendario',
    location: location || '',
    url: url || '',
    meetingUrl: meetingUrl || '',
    when: formatEventWhen(start, end),
    startAt: start?.date && !Number.isNaN(start.date.getTime()) ? start.date.toISOString() : null,
    endAt: end?.date && !Number.isNaN(end.date.getTime()) ? end.date.toISOString() : null,
    allDay: Boolean(start?.allDay),
  }
}

module.exports = {
  isCalendarAttachment,
  parseIcsSummary,
  formatEventWhen,
  unfoldIcs,
}
