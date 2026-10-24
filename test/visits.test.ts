/**
 * Turning badge scans into visits.
 *
 * The first two cases are the real scans from the account this was built
 * against, so the grouping is pinned to data the club actually produced rather
 * than to what it seemed reasonable to expect.
 */

import { describe, expect, it } from 'vitest'
import type { Scan } from '#shared/visits'
import {
  describeDuration,
  toVisits,
  usualPattern,
  visitsOnWeekday,
  weekdayOf,
} from '#shared/visits'

const scan = (at: string, door = '155'): Scan => ({
  id: `/gs/entries/${at}`,
  at,
  crossingPoint: `/gs/doors/${door}`,
})

describe('grouping scans into visits', () => {
  it('pairs the first and last scan of a session', () => {
    // 16 Aug, as recorded: in at 09:25, out at 10:27.
    const visits = toVisits([
      scan('2026-08-16T09:25:33', '155'),
      scan('2026-08-16T10:27:32', '156'),
    ])

    expect(visits).toEqual([
      { date: '2026-08-16', arrived: '09:25', left: '10:27', minutes: 62, scans: 2 },
    ])
  })

  it('treats internal doors as part of one visit', () => {
    // 17 Aug: entrance, then a studio door two minutes later, then out.
    const visits = toVisits([
      scan('2026-08-17T19:11:09', '154'),
      scan('2026-08-17T19:13:01', '146'),
      scan('2026-08-17T20:16:22', '156'),
    ])

    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({ arrived: '19:11', left: '20:16', minutes: 65, scans: 3 })
  })

  it('splits two sessions in the same day', () => {
    // Grouping by calendar date would call this one eleven-hour visit.
    const visits = toVisits([
      scan('2026-08-16T09:25:00'),
      scan('2026-08-16T10:30:00'),
      scan('2026-08-16T18:00:00'),
      scan('2026-08-16T19:15:00'),
    ])

    expect(visits).toHaveLength(2)
    expect(visits[0]).toMatchObject({ arrived: '09:25', left: '10:30' })
    expect(visits[1]).toMatchObject({ arrived: '18:00', left: '19:15' })
  })

  it('does not invent a departure from a single scan', () => {
    // Reporting the same time for both ends would claim a zero-minute visit.
    expect(toVisits([scan('2026-08-16T09:25:00')])).toEqual([
      { date: '2026-08-16', arrived: '09:25', left: null, minutes: null, scans: 1 },
    ])
  })

  it('sorts scans that arrive out of order', () => {
    const visits = toVisits([scan('2026-08-16T10:27:00'), scan('2026-08-16T09:25:00')])
    expect(visits[0]).toMatchObject({ arrived: '09:25', left: '10:27' })
  })

  it('separates visits on consecutive days', () => {
    expect(toVisits([scan('2026-08-16T22:00:00'), scan('2026-08-17T09:00:00')])).toHaveLength(2)
  })

  it('has nothing to say about no scans', () => {
    expect(toVisits([])).toEqual([])
  })
})

describe('usual pattern', () => {
  it('takes the median so one late night does not move the answer', () => {
    const visits = toVisits([
      scan('2026-08-10T18:00:00'), scan('2026-08-10T19:00:00'),
      scan('2026-08-12T18:10:00'), scan('2026-08-12T19:10:00'),
      // An outlier three hours later than the rest.
      scan('2026-08-14T21:00:00'), scan('2026-08-14T22:00:00'),
    ])

    const pattern = usualPattern(visits)!
    expect(pattern.arrived).toBe('18:10')
    expect(pattern.left).toBe('19:10')
    expect(pattern.samples).toBe(3)
  })

  it('averages the middle two on an even count', () => {
    const visits = toVisits([scan('2026-08-10T18:00:00'), scan('2026-08-12T19:00:00')])
    expect(usualPattern(visits)!.arrived).toBe('18:30')
  })

  it('reports no departure when no visit recorded one', () => {
    const pattern = usualPattern(toVisits([scan('2026-08-10T18:00:00')]))!
    expect(pattern.arrived).toBe('18:00')
    expect(pattern.left).toBeNull()
    expect(pattern.samples).toBe(1)
  })

  it('is null with nothing to go on', () => {
    expect(usualPattern([])).toBeNull()
  })

  it('refuses to claim a usual time for visits that do not cluster', () => {
    // The real case that caught this: one morning visit and one evening one.
    // The median is 14:18, an afternoon this member was never present for.
    const visits = toVisits([
      scan('2026-08-16T09:25:33'), scan('2026-08-16T10:27:32'),
      scan('2026-08-17T19:11:09'), scan('2026-08-17T20:16:22'),
    ])

    const pattern = usualPattern(visits)!
    expect(pattern.consistent).toBe(false)
    expect(pattern.spreadMinutes).toBe(586)
  })

  it('is happy to claim one when the visits do cluster', () => {
    const visits = toVisits([
      scan('2026-08-10T18:00:00'), scan('2026-08-10T19:00:00'),
      scan('2026-08-12T18:30:00'), scan('2026-08-12T19:30:00'),
    ])

    const pattern = usualPattern(visits)!
    expect(pattern.consistent).toBe(true)
    expect(pattern.arrived).toBe('18:15')
  })
})

describe('weekdays', () => {
  it('reads the weekday off the date without a timezone in sight', () => {
    expect(weekdayOf('2026-08-16')).toBe(0) // Sunday
    expect(weekdayOf('2026-08-17')).toBe(1) // Monday
    expect(weekdayOf('2026-08-18')).toBe(2) // Tuesday
  })

  it('picks out the visits on the same weekday, newest first', () => {
    const visits = toVisits([
      scan('2026-08-11T18:00:00'), // Tuesday
      scan('2026-08-13T18:00:00'), // Thursday
      scan('2026-08-18T19:00:00'), // Tuesday
    ])

    const tuesdays = visitsOnWeekday(visits, '2026-08-25')
    expect(tuesdays.map(v => v.date)).toEqual(['2026-08-18', '2026-08-11'])
  })
})

describe('durations', () => {
  it('reads as a person would say it', () => {
    expect(describeDuration(45)).toBe('45m')
    expect(describeDuration(62)).toBe('1h 2m')
    expect(describeDuration(120)).toBe('2h')
    expect(describeDuration(null)).toBe('')
  })
})
