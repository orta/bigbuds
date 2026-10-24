import { describe, expect, it } from 'vitest'
import { buildCalendar, fold, icsEscape, icsLocal } from '../shared/ics'

const NOW = '2026-08-14T05:30:00.000Z'

const feed = (events: Parameters<typeof buildCalendar>[0]['events']) =>
  buildCalendar({ name: 'KAL — Sam Ross', events, now: NOW })

const CLASS = {
  uid: 'gs-sessions-1722803@bigbuds',
  start: '2026-08-14T06:30:00',
  end: '2026-08-14T07:15:00',
  summary: 'Body Pump',
}

describe('icsLocal', () => {
  it('strips punctuation and changes nothing else', () => {
    expect(icsLocal('2026-08-14T06:30:00')).toBe('20260814T063000')
  })
})

describe('icsEscape', () => {
  it('escapes the separators the format reserves', () => {
    expect(icsEscape('Legs, Bums; Tums')).toBe('Legs\\, Bums\\; Tums')
  })

  it('escapes backslashes before anything else, not after', () => {
    // Escaping the semicolon first would leave `a\\;b` — a literal backslash
    // followed by an unescaped separator, which truncates the property.
    expect(icsEscape('a\\;b')).toBe('a\\\\\\;b')
  })

  it('turns a real newline into the two characters the format wants', () => {
    expect(icsEscape('With Sam\nWaiting list')).toBe('With Sam\\nWaiting list')
    expect(icsEscape('a\r\nb')).toBe('a\\nb')
  })
})

describe('fold', () => {
  it('leaves a short line alone', () => {
    expect(fold('SUMMARY:Body Pump')).toBe('SUMMARY:Body Pump')
  })

  it('breaks a long line with a continuation space', () => {
    const folded = fold(`SUMMARY:${'a'.repeat(200)}`)
    const lines = folded.split('\r\n')

    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]!.length).toBe(75)
    // Every continuation is marked by the leading space, and unfolding is
    // dropping the CRLF and that one character.
    for (const line of lines.slice(1)) expect(line.startsWith(' ')).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'a'.repeat(200)}`)
  })

  /** The limit is octets, and splitting mid-codepoint would produce mojibake. */
  it('counts bytes rather than characters, and never splits one', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`
    const folded = fold(line)

    for (const piece of folded.split('\r\n')) {
      expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
})

describe('buildCalendar', () => {
  const lines = (text: string) => text.split('\r\n')

  it('wraps the events in a calendar', () => {
    const out = lines(feed([CLASS]))

    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out.at(-2)).toBe('END:VCALENDAR')
    expect(out).toContain('BEGIN:VEVENT')
    expect(out).toContain('SUMMARY:Body Pump')
  })

  it('ends every line with CRLF, including the last', () => {
    const out = feed([CLASS])

    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(/[^\r]\n/.test(out)).toBe(false)
  })

  /**
   * The point of the whole file. A 06:30 class is 06:30 in London whatever the
   * server thinks the time is, so the naive string goes out as written with a
   * `TZID` on it rather than being converted to an instant.
   */
  it('emits the club wall-clock time verbatim, with a zone', () => {
    const out = lines(feed([CLASS]))

    expect(out).toContain('DTSTART;TZID=Europe/London:20260814T063000')
    expect(out).toContain('DTEND;TZID=Europe/London:20260814T071500')
    // Nothing anywhere converted it to UTC behind our backs.
    expect(out.some(line => line.startsWith('DTSTART') && line.endsWith('Z'))).toBe(false)
  })

  it('defines the zone it refers to, so a client need not know London', () => {
    const out = lines(feed([CLASS]))

    expect(out).toContain('BEGIN:VTIMEZONE')
    expect(out).toContain('TZID:Europe/London')
    // Last Sunday in March forward, last Sunday in October back.
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU')
  })

  it('marks a waiting-list place as tentative', () => {
    const out = lines(feed([{ ...CLASS, summary: 'Waiting list · Body Pump', tentative: true }]))

    expect(out).toContain('STATUS:TENTATIVE')
    expect(out).toContain('SUMMARY:Waiting list · Body Pump')
  })

  it('marks a real booking as confirmed', () => {
    expect(lines(feed([CLASS]))).toContain('STATUS:CONFIRMED')
  })

  it('gives every event a stable uid, so a re-poll updates rather than duplicates', () => {
    expect(lines(feed([CLASS]))).toContain('UID:gs-sessions-1722803@bigbuds')
  })

  it('leaves out the optional properties it has no value for', () => {
    const out = lines(feed([CLASS]))

    expect(out.some(line => line.startsWith('LOCATION'))).toBe(false)
    expect(out.some(line => line.startsWith('DESCRIPTION'))).toBe(false)
  })

  it('includes them when it does', () => {
    const out = lines(feed([{ ...CLASS, location: 'Studio 2', description: 'With Sam' }]))

    expect(out).toContain('LOCATION:Studio 2')
    expect(out).toContain('DESCRIPTION:With Sam')
  })

  it('holds one VEVENT per class', () => {
    const out = lines(feed([CLASS, { ...CLASS, uid: 'second@bigbuds' }]))

    expect(out.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(2)
  })

  it('is a valid, empty calendar when nothing is booked', () => {
    const out = lines(feed([]))

    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).not.toContain('BEGIN:VEVENT')
    expect(out.at(-2)).toBe('END:VCALENDAR')
  })

  /** DTSTAMP is a real instant, and the only UTC value in the document. */
  it('stamps with a UTC instant', () => {
    expect(lines(feed([CLASS]))).toContain('DTSTAMP:20260814T053000Z')
  })
})
