/**
 * Which class types a member has actually been to.
 *
 * Every exclusion here inflates the count if you forget it, and an inflated
 * count is worse than none: the whole point is to tell a class you know from
 * one you have never tried.
 */

import { describe, expect, it } from 'vitest'
import { buildAttended } from '../server/utils/members'
import type { Attendee } from '../server/utils/resamania'

const NOW = '2026-08-19T12:00:00'
const PUMP = '/bigbox/activities/2300'
const YOGA = '/bigbox/activities/2818'

let next = 0
const booking = (
  activity: string | null,
  startedAt: string,
  state = 'booked',
): Attendee => ({
  '@id': `/bigbox/attendees/${++next}`,
  contactId: '/bigbox/contacts/1',
  state,
  classEvent: {
    '@id': `/bigbox/class_events/${next}`,
    ...(activity ? { activity } : {}),
    startedAt,
  },
})

describe('building the attendance history', () => {
  it('counts repeats of the same class type', () => {
    const attended = buildAttended([
      booking(PUMP, '2026-08-01T09:00:00'),
      booking(PUMP, '2026-08-08T09:00:00'),
      booking(YOGA, '2026-08-05T18:00:00'),
    ], NOW)

    expect(attended[PUMP]).toEqual({ count: 2, lastAt: '2026-08-08T09:00:00' })
    expect(attended[YOGA]).toEqual({ count: 1, lastAt: '2026-08-05T18:00:00' })
  })

  it('keeps the latest date whatever order the records arrive in', () => {
    const attended = buildAttended([
      booking(PUMP, '2026-08-08T09:00:00'),
      booking(PUMP, '2026-08-01T09:00:00'),
    ], NOW)

    expect(attended[PUMP]!.lastAt).toBe('2026-08-08T09:00:00')
  })

  it('does not count a class that has not happened yet', () => {
    // A booking for next week is not an attendance.
    expect(buildAttended([booking(PUMP, '2026-08-26T09:00:00')], NOW)).toEqual({})
  })

  it('counts a class that started earlier today', () => {
    expect(buildAttended([booking(PUMP, '2026-08-19T09:00:00')], NOW)[PUMP]?.count).toBe(1)
  })

  it('does not count cancellations', () => {
    const attended = buildAttended([
      booking(PUMP, '2026-08-01T09:00:00', 'canceled'),
      booking(PUMP, '2026-08-02T09:00:00', 'cancelled'),
      booking(PUMP, '2026-08-03T09:00:00', 'refused'),
    ], NOW)

    expect(attended).toEqual({})
  })

  it('does not count a waiting-list place that never became a seat', () => {
    expect(buildAttended([booking(PUMP, '2026-08-01T09:00:00', 'queued')], NOW)).toEqual({})
  })

  it('ignores records with nothing to key on', () => {
    const attended = buildAttended([
      booking(null, '2026-08-01T09:00:00'),
      { '@id': '/bigbox/attendees/99', state: 'booked' },
    ], NOW)

    expect(attended).toEqual({})
  })
})
