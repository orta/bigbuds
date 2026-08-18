/**
 * Turning badge scans into visits.
 *
 * The club's access control records one row per scan at a door — the API calls
 * them *entries* — with a timestamp and a crossing point, and nothing that
 * says which way the member was walking. The doors evidently know: the
 * collection can be filtered on `crossingPoint.entryZone` and
 * `crossingPoint.exitZone`. But `crossing_points` itself is closed to members
 * (403 on the collection and on each door), so there is no way to learn which
 * door is which from the member API.
 *
 * So direction is inferred from time instead, which turns out to be enough:
 * within one visit, the first scan is the arrival and the last is the
 * departure. Everything in between is internal doors — the studio, the pool —
 * and is only interesting as evidence the visit was still going.
 */

import type { Naive } from './naive'
import { minutesBetween, naiveDate, naiveTime } from './naive'

/** A raw scan, as stored. */
export interface Scan {
  id: string
  at: Naive
  crossingPoint: string
}

/** One trip to the gym. */
export interface Visit {
  /** Naive date, `2026-08-16`. */
  date: string
  /** `09:25`. */
  arrived: string
  /** `10:27`, or `null` when only one scan was recorded. */
  left: string | null
  /** Length in minutes, when both ends are known. */
  minutes: number | null
  /** How many scans made up this visit. */
  scans: number
}

/**
 * The gap that separates two visits.
 *
 * Grouping by calendar date instead would merge a morning session and an
 * evening one into a single eleven-hour "visit". Three hours is comfortably
 * longer than any gym session and far shorter than the gap between two trips
 * in a day.
 */
const VISIT_GAP_MINUTES = 3 * 60

/** Groups scans into visits, oldest first. */
export function toVisits(scans: Scan[]): Visit[] {
  if (!scans.length) return []

  const ordered = [...scans].sort((a, b) => a.at.localeCompare(b.at))
  const groups: Scan[][] = []

  for (const scan of ordered) {
    const current = groups.at(-1)
    const previous = current?.at(-1)

    if (!current || !previous || minutesBetween(previous.at, scan.at) > VISIT_GAP_MINUTES) {
      groups.push([scan])
    } else {
      current.push(scan)
    }
  }

  return groups.map(group => {
    const first = group[0]!
    const last = group.at(-1)!
    const single = group.length === 1

    return {
      date: naiveDate(first.at),
      arrived: naiveTime(first.at),
      // A lone scan says when they arrived and nothing about when they left.
      // Reporting the same time for both would invent a zero-minute visit.
      left: single ? null : naiveTime(last.at),
      minutes: single ? null : minutesBetween(first.at, last.at),
      scans: group.length,
    }
  })
}

/**
 * How far apart arrivals can be while a single "usual" time still means
 * something. Beyond this the visits are better described as varying.
 */
const CONSISTENT_SPREAD_MINUTES = 2 * 60

export interface UsualPattern {
  /** Typical arrival, `19:10`. Only meaningful when `consistent`. */
  arrived: string
  /** Typical departure, when enough visits recorded one. */
  left: string | null
  /** How many visits this is drawn from — small numbers mean "so far". */
  samples: number
  /** Minutes between the earliest and latest arrival. */
  spreadMinutes: number
  /**
   * Whether the arrivals cluster tightly enough for a single time to be worth
   * quoting.
   *
   * Without this the median quietly invents a time nobody attended: someone
   * who came once at 09:25 and once at 19:11 has a median arrival of 14:18, an
   * afternoon they were never there. A caller should describe an inconsistent
   * member by their actual visits instead.
   */
  consistent: boolean
}

/**
 * When this member usually turns up.
 *
 * The median rather than the mean, so one unusual late night does not drag the
 * answer an hour later than any actual visit. `samples` is returned alongside
 * because with a week of history the honest reading is often "twice so far"
 * rather than "usually", and the caller should be able to say so.
 */
export function usualPattern(visits: Visit[]): UsualPattern | null {
  if (!visits.length) return null

  const arrivals = visits.map(visit => toMinutes(visit.arrived))
  const departures = visits.flatMap(visit => (visit.left ? [toMinutes(visit.left)] : []))

  const spreadMinutes = Math.max(...arrivals) - Math.min(...arrivals)

  return {
    arrived: toClock(median(arrivals)),
    left: departures.length ? toClock(median(departures)) : null,
    samples: visits.length,
    spreadMinutes,
    consistent: spreadMinutes <= CONSISTENT_SPREAD_MINUTES,
  }
}

/** Visits on the same weekday as `date`, most recent first. */
export function visitsOnWeekday(visits: Visit[], date: string): Visit[] {
  const target = weekdayOf(date)
  return visits.filter(visit => weekdayOf(visit.date) === target).reverse()
}

/** `0` is Sunday, matching `Date.getUTCDay`. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** `1h 2m`, `45m`. */
export function describeDuration(minutes: number | null): string {
  if (minutes === null) return ''
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const toMinutes = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number) as [number, number]
  return hours * 60 + minutes
}

const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  // Even counts average the two middle values, then round to a whole minute —
  // a clock time with a fraction of a minute would be nonsense.
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
}
