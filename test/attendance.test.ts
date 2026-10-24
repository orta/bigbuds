/**
 * Which class types a member has actually been to.
 *
 * Every exclusion here inflates the count if you forget it, and an inflated
 * count is worse than none: the whole point is to tell a class you know from
 * one you have never tried.
 *
 * Gladstone keys a class type off its title (it has no stable type id), so the
 * history is keyed by the slugged title — the same key `resolve` and the notes
 * use, which is what keeps a count attached across the weekly repeats.
 */

import { describe, expect, it } from 'vitest'
import { buildAttended } from '../server/utils/members'
import type { Attendee, ClassEvent } from '../server/utils/gladstone'

const NOW = '2026-08-19T12:00:00'
const PUMP = '/gs/activities/body-pump'
const YOGA = '/gs/activities/yoga'

let next = 0
const booking = (
  title: string,
  startedAt: string,
  state = 'booked',
): Attendee => {
  const id = `/gs/sessions/${++next}`
  const classEvent: ClassEvent = { '@id': id, sessionId: next, title, startedAt }
  return { '@id': id, contactId: '/gs/contacts/1', state, classEvent }
}

describe('building the attendance history', () => {
  it('counts repeats of the same class type', () => {
    const attended = buildAttended([
      booking('Body Pump', '2026-08-01T09:00:00'),
      booking('Body Pump', '2026-08-08T09:00:00'),
      booking('Yoga', '2026-08-05T18:00:00'),
    ], NOW)

    expect(attended[PUMP]).toEqual({ count: 2, lastAt: '2026-08-08T09:00:00' })
    expect(attended[YOGA]).toEqual({ count: 1, lastAt: '2026-08-05T18:00:00' })
  })

  it('keeps the latest date whatever order the records arrive in', () => {
    const attended = buildAttended([
      booking('Body Pump', '2026-08-08T09:00:00'),
      booking('Body Pump', '2026-08-01T09:00:00'),
    ], NOW)

    expect(attended[PUMP]!.lastAt).toBe('2026-08-08T09:00:00')
  })

  it('does not count a class that has not happened yet', () => {
    // A booking for next week is not an attendance.
    expect(buildAttended([booking('Body Pump', '2026-08-26T09:00:00')], NOW)).toEqual({})
  })

  it('counts a class that started earlier today', () => {
    expect(buildAttended([booking('Body Pump', '2026-08-19T09:00:00')], NOW)[PUMP]?.count).toBe(1)
  })

  it('does not count cancellations', () => {
    const attended = buildAttended([
      booking('Body Pump', '2026-08-01T09:00:00', 'canceled'),
      booking('Body Pump', '2026-08-02T09:00:00', 'cancelled'),
      booking('Body Pump', '2026-08-03T09:00:00', 'refused'),
    ], NOW)

    expect(attended).toEqual({})
  })

  it('does not count a waiting-list place that never became a seat', () => {
    expect(buildAttended([booking('Body Pump', '2026-08-01T09:00:00', 'queued')], NOW)).toEqual({})
  })

  it('ignores records with nothing to key on', () => {
    const attended = buildAttended([
      booking('', '2026-08-01T09:00:00'),
      { '@id': '/gs/sessions/99', state: 'booked' },
    ], NOW)

    expect(attended).toEqual({})
  })
})
