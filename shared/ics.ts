/**
 * The iCalendar feed a member subscribes their phone to.
 *
 * Written by hand rather than with a library, for the same reason `favicon.ico`
 * is: the subset of RFC 5545 a read-only feed of timed events needs is small
 * and completely specified, and the parts that are easy to get wrong — folding,
 * escaping, and the timezone — are exactly the parts a library would hide.
 *
 * ## Times
 *
 * This is the one place in the app where the club's naive wall-clock strings
 * have to leave the building, and the format has somewhere honest to put them.
 * `DTSTART;TZID=Europe/London:20260814T063000` says *06:30 in London*, which is
 * precisely what the API meant, so the string goes out with its punctuation
 * removed and nothing else done to it. Converting to UTC would work too and is
 * what most exporters do, but it would mean this file computing an offset — the
 * thing `shared/naive.ts` exists to avoid — and it would show the wrong hour to
 * anyone who exported in August and read in January.
 *
 * The cost of `TZID` is that the feed has to define the zone, which is the
 * `VTIMEZONE` block below: two rules, unchanged since 1996, that say when
 * Britain's clocks move. A calendar client that has never heard of London can
 * place these events correctly from the feed alone.
 */

import type { Naive } from './naive'

/** One class in the feed. */
export interface CalendarEvent {
  /** Stable across regenerations, so a re-poll updates rather than duplicates. */
  uid: string
  start: Naive
  end: Naive
  summary: string
  description?: string
  location?: string
  /**
   * A waiting-list place rather than a booking.
   *
   * Emitted as `STATUS:TENTATIVE`, which most clients show in a lighter or
   * hatched style — the calendar equivalent of the dimmed avatars on the
   * timetable, and for the same reason: it is not a promise to be there.
   */
  tentative?: boolean
}

export interface CalendarOptions {
  /** What the calendar is called once subscribed, e.g. `KAL Pal — Sam`. */
  name: string
  events: CalendarEvent[]
  /** ISO instant for `DTSTAMP`. Injected so the output is testable. */
  now?: string
}

export const CALENDAR_TIMEZONE = 'Europe/London'

/**
 * Britain's clock changes, as iCalendar recurrence rules.
 *
 * `DTSTART` in each block is in the local time *before* the change, which is
 * what makes the two look inconsistent: the spring transition happens at 01:00
 * GMT and the autumn one at 01:00 UTC, which is 02:00 BST. Both rules have
 * been in force since 1996 and are not scheduled to change.
 */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${CALENDAR_TIMEZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/** `2026-08-14T06:30:00` → `20260814T063000`. No arithmetic, just punctuation. */
export function icsLocal(value: Naive): string {
  return value.replace(/[-:]/g, '')
}

/** An ISO instant → `20260814T053000Z`, for `DTSTAMP`. */
function icsUtc(iso: string): string {
  return `${new Date(iso).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

/**
 * Escapes a value for a text property.
 *
 * The backslash has to go first or it would escape the escapes added after it.
 * Newlines become the literal two characters `\n`, which is how the format
 * carries a multi-line description — a real newline would start a new property
 * and truncate everything after it, which is how a member's note with a line
 * break in it would silently eat the rest of their calendar.
 */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Folds a line to 75 octets, continuing with a leading space.
 *
 * Octets, not characters: the limit is on bytes, and a class name with a `£`
 * or an accented coach's name in it costs two. Splitting mid-codepoint would
 * produce mojibake, so the width is measured in UTF-8 bytes while the split
 * happens between codepoints.
 */
export function fold(line: string): string {
  const bytes = (text: string) => new TextEncoder().encode(text).length
  if (bytes(line) <= 75) return line

  const out: string[] = []
  // The first line takes 75 octets; every continuation spends one on its own
  // leading space.
  let current = ''
  let limit = 75

  for (const char of line) {
    if (bytes(current) + bytes(char) > limit) {
      out.push(current)
      current = ''
      limit = 74
    }
    current += char
  }

  if (current) out.push(current)

  return out.join('\r\n ')
}

/** Builds the whole document. Lines are CRLF-terminated, as the format requires. */
export function buildCalendar({ name, events, now }: CalendarOptions): string {
  const stamp = icsUtc(now ?? new Date().toISOString())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KAL Pal//Class bookings//EN',
    'CALSCALE:GREGORIAN',
    // A feed, not an invitation: nothing here expects a reply.
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    // Bookings change on the club's schedule rather than the member's, so ask
    // for an hourly poll. Both spellings: the standard one, and the one Apple
    // and Google actually read.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
  ]

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${CALENDAR_TIMEZONE}:${icsLocal(event.start)}`,
      `DTEND;TZID=${CALENDAR_TIMEZONE}:${icsLocal(event.end)}`,
      `SUMMARY:${icsEscape(event.summary)}`,
    )

    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`)

    lines.push(
      `STATUS:${event.tentative ? 'TENTATIVE' : 'CONFIRMED'}`,
      // A class is somewhere to be, so it should make the member look busy.
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  return `${lines.map(fold).join('\r\n')}\r\n`
}
