/**
 * The wall-clock handling, which is the part most likely to be quietly wrong.
 *
 * The Rust client pins a BST and a GMT date for the same reason: being an hour
 * out for half the year is the failure mode you would not notice until a
 * member misses a class.
 */

import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMinutes,
  minutesBetween,
  naiveDate,
  naiveNow,
  naiveTime,
  parseNaive,
  today,
} from '#shared/naive'

describe('parsing', () => {
  it('accepts the API\'s format and rejects anything else', () => {
    expect(parseNaive('2026-08-14T06:30:00')).toBe('2026-08-14T06:30:00')
    expect(parseNaive(null)).toBeNull()
    expect(parseNaive(undefined)).toBeNull()
    expect(parseNaive('')).toBeNull()
    // An offset would mean the value is not naive, so it is not one of ours.
    expect(parseNaive('2026-08-14T06:30:00+01:00')).toBeNull()
    expect(parseNaive('2026-08-14')).toBeNull()
  })

  it('splits into date and time', () => {
    expect(naiveDate('2026-08-14T06:30:00')).toBe('2026-08-14')
    expect(naiveTime('2026-08-14T06:30:00')).toBe('06:30')
  })
})

describe('ordering', () => {
  /**
   * The whole design rests on this: fixed-width and zero-padded means string
   * order is time order, so comparisons need no parsing.
   */
  it('sorts chronologically as plain strings', () => {
    const times = [
      '2026-08-14T18:00:00',
      '2026-08-14T06:30:00',
      '2026-08-13T23:59:59',
      '2026-08-14T06:05:00',
    ]

    expect([...times].sort()).toEqual([
      '2026-08-13T23:59:59',
      '2026-08-14T06:05:00',
      '2026-08-14T06:30:00',
      '2026-08-14T18:00:00',
    ])
  })
})

describe('arithmetic across DST', () => {
  it('adds a day across the spring forward', () => {
    // BST starts on 29 March 2026 in the UK.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('adds a day across the autumn back', () => {
    // GMT resumes on 25 October 2026.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('spans months and years', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-08-14', 14)).toBe('2026-08-28')
  })

  it('adds minutes without shifting the clock on a DST day', () => {
    // A class at 00:30 on the morning the clocks go forward still ends 45
    // minutes later by the wall clock, because a naive time has no zone to
    // spring forward in.
    expect(addMinutes('2026-03-29T00:30:00', 45)).toBe('2026-03-29T01:15:00')
    expect(addMinutes('2026-08-14T06:30:00', 45)).toBe('2026-08-14T07:15:00')
    expect(addMinutes('2026-08-14T23:30:00', 45)).toBe('2026-08-15T00:15:00')
  })

  it('measures durations', () => {
    expect(minutesBetween('2026-08-14T06:30:00', '2026-08-14T07:15:00')).toBe(45)
    expect(minutesBetween('2026-08-14T23:30:00', '2026-08-15T00:15:00')).toBe(45)
  })
})

describe('now', () => {
  it('is well-formed and agrees with its own date half', () => {
    const now = naiveNow()
    expect(parseNaive(now)).toBe(now)
    expect(today()).toBe(naiveDate(now))
  })

  it('reports the club\'s wall clock, not the machine\'s', () => {
    // Whatever the server's zone, London and Tokyo disagree, and the club's
    // answer must track London.
    const london = naiveNow('Europe/London')
    const tokyo = naiveNow('Asia/Tokyo')
    expect(london).not.toBe(tokyo)
    expect(parseNaive(tokyo)).toBe(tokyo)
  })

  it('renders midnight as 00, not 24', () => {
    // `hour12: false` yields "24" at midnight in some engines, which would
    // produce an unparseable timestamp for anyone loading the page then.
    expect(naiveNow()).toMatch(/T(?:[01]\d|2[0-3]):/)
  })
})
