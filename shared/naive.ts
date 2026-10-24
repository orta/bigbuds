/**
 * Naive wall-clock times.
 *
 * The app speaks timestamps as `"2026-08-14T06:30:00"` — no offset, no zone,
 * wall-clock time in the club's own timezone. Gladstone sends Unix epochs, and
 * `server/utils/gladstone.ts` turns them into these at the boundary; nothing
 * past that point ever sees a `Date`. (The format is inherited from Resamania,
 * the first backend, which sent naive strings natively — and it turned out to
 * be the right shape to keep.)
 *
 * A naive timestamp is kept as its original string. That is not laziness: the
 * format is fixed-width and zero-padded, so lexicographic order *is*
 * chronological order, and `a < b` on two of these strings is a correct time
 * comparison with no parsing at all. Turning them into `Date`s would silently
 * reinterpret them in whatever zone the server happens to run in — which on
 * Railway is UTC, and on a laptop in London is not, so the bug would only show
 * up in production for half the year.
 */

/** `YYYY-MM-DDTHH:MM:SS`, e.g. `2026-08-14T06:30:00`. */
export type Naive = string

/** `YYYY-MM-DD`. */
export type NaiveDate = string

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

/** The club's zone. Its `timezone` field says `Europe/London`. */
export const CLUB_TIMEZONE = 'Europe/London'

/** Narrows an API string to a `Naive`, or `null` if it is missing or malformed. */
export function parseNaive(value: string | null | undefined): Naive | null {
  if (!value) return null
  return NAIVE.test(value) ? value : null
}

/** The date half of a naive timestamp. */
export function naiveDate(value: Naive): NaiveDate {
  return value.slice(0, 10)
}

/** The `HH:MM` of a naive timestamp. */
export function naiveTime(value: Naive): string {
  return value.slice(11, 16)
}

/**
 * Now, as wall-clock time in the club's zone.
 *
 * `Intl` is doing the real work here — it is the only thing in the platform
 * that knows what the time is in London, including which side of a DST
 * boundary today falls on.
 */
export function naiveNow(timeZone = CLUB_TIMEZONE): Naive {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '00'

  // `hour12: false` yields hour 24 rather than 00 at midnight in some engines.
  const hour = at('hour') === '24' ? '00' : at('hour')

  return `${at('year')}-${at('month')}-${at('day')}T${hour}:${at('minute')}:${at('second')}`
}

/** Today's date in the club's zone. */
export function today(timeZone = CLUB_TIMEZONE): NaiveDate {
  return naiveDate(naiveNow(timeZone))
}

/**
 * Adds days to a naive date.
 *
 * The arithmetic goes through UTC on purpose: a naive date has no zone, so
 * pinning it to UTC means no DST transition can shorten or lengthen a day
 * along the way. Adding 1 to a clocks-change Sunday must give the next
 * calendar date, not 23 or 25 hours later.
 */
export function addDays(date: NaiveDate, days: number): NaiveDate {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Adds minutes to a naive timestamp, by the same UTC-anchored reasoning. */
export function addMinutes(value: Naive, minutes: number): Naive {
  const at = new Date(`${value}Z`)
  at.setUTCMinutes(at.getUTCMinutes() + minutes)
  return at.toISOString().slice(0, 19)
}

/** Whole minutes between two naive timestamps. */
export function minutesBetween(from: Naive, to: Naive): number {
  return Math.round((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60_000)
}
