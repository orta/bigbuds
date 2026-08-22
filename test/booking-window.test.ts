/**
 * The booking window.
 *
 * The failure this guards against is not a crash: it is a day picker that
 * offers a date the club will not take a booking for, so a member presses
 * Book on a class with places free and is told it failed.
 */

import { describe, expect, it } from 'vitest'
import { BOOKING_DAYS_AHEAD, bookableDays, lastBookableDate } from '#shared/booking'

describe('the window the club actually opens', () => {
  /** The observed case: on Wednesday the 19th, Thursday the 27th is the last day. */
  it('runs to eight days past today', () => {
    expect(lastBookableDate('2026-08-19')).toBe('2026-08-27')
    expect(bookableDays('2026-08-19')).toHaveLength(BOOKING_DAYS_AHEAD + 1)
  })

  it('starts at today and has no gaps', () => {
    const days = bookableDays('2026-08-19')
    expect(days[0]).toBe('2026-08-19')
    expect(days.at(-1)).toBe(lastBookableDate('2026-08-19'))
    expect(new Set(days).size).toBe(days.length)
  })

  it('crosses a month end without arithmetic of its own', () => {
    expect(lastBookableDate('2026-08-28')).toBe('2026-09-05')
    expect(bookableDays('2026-12-30')).toContain('2027-01-01')
  })

  /**
   * The dates are naive, so the clocks going back must not shorten a day into
   * the previous one — the same reason `addDays` goes through UTC.
   */
  it('is unmoved by a clocks change', () => {
    expect(bookableDays('2026-10-24').slice(0, 4))
      .toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  })
})
