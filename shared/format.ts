/**
 * Display formatting shared by the server and the browser.
 *
 * Every time value here is a naive wall-clock string in the club's zone (see
 * `./naive.ts`). Nothing in this file constructs a `Date` from one, because
 * doing so would reinterpret a London class time in the *viewer's* zone — and
 * a member checking the timetable from abroad would be told their 06:30 class
 * is at 07:30.
 */

import { addMinutes, naiveDate, naiveTime, type Naive } from './naive'

/** `06:30–07:15`, or just `06:30` when the duration is unknown. */
export function timeRange(start: Naive | null, durationMinutes: number | null): string {
  if (!start) return ''
  if (durationMinutes === null) return naiveTime(start)
  return `${naiveTime(start)}–${naiveTime(addMinutes(start, durationMinutes))}`
}

/**
 * The capacity line: `12/30 free`, or `Full · 6 waiting` once it has gone.
 *
 * Takes the class rather than four positional arguments because three of them
 * would be nullable numbers, and getting them the wrong way round would
 * produce something that still reads plausibly.
 */
export function placesText(entry: {
  placesRemaining: number | null
  capacity: number | null
  isCancelled?: boolean
  queueCount?: number | null
}): string {
  if (entry.isCancelled) return 'Cancelled'
  if (entry.placesRemaining === null) return ''

  if (entry.placesRemaining <= 0) {
    // How long the queue already is decides whether joining it is worth it,
    // so it belongs next to "Full" rather than a click away.
    return entry.queueCount ? `Full · ${entry.queueCount} waiting` : 'Full'
  }

  return entry.capacity === null
    ? `${entry.placesRemaining} free`
    : `${entry.placesRemaining}/${entry.capacity} free`
}

/** `#2 of 6` — a waiting-list place, with the queue it sits in. */
export function queuePositionText(
  position: number | null,
  queueCount: number | null,
): string {
  if (position === null) return queueCount ? `${queueCount} waiting` : ''
  return queueCount ? `#${position} of ${queueCount}` : `#${position}`
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * `Monday 18 August`.
 *
 * Formatted by hand from the date's own parts rather than through `Intl`,
 * for the same reason as above: a naive date pushed through `new Date()` can
 * come back a day earlier for anyone west of the club.
 */
export function dayLabel(date: string, style: 'long' | 'short' = 'long'): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!

  return style === 'long'
    ? `${weekday} ${day} ${MONTHS[month - 1]}`
    : `${weekday.slice(0, 3)} ${day}`
}

/** `Today`, `Tomorrow`, or the weekday — for the day picker. */
export function relativeDayLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  return dayLabel(date, 'short')
}

/** `Today at 18:30` / `Mon 24 at 09:00` — for a single upcoming class. */
export function whenLabel(start: Naive, today: string, tomorrow: string): string {
  const date = naiveDate(start)
  const day
    = date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : dayLabel(date, 'short')
  return `${day} at ${naiveTime(start)}`
}
