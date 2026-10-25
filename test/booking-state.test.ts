/**
 * Booking state, read off a Gladstone session.
 *
 * Gladstone personalises each session with the viewer's own state inline
 * (`myBookingStatus`, `waitListPos`, `slotsAvailable`, `waitListCount`) rather
 * than listing everyone's attendee records the way Resamania, the first backend, did. These are the
 * helpers that turn that into the booked / queued / full / has-room answers the
 * timetable renders.
 */

import { describe, expect, it } from 'vitest'
import type { Attendee, ClassEvent } from '../server/utils/gladstone'
import {
  hasQueueSpace,
  isActive,
  isBookedBy,
  isCancellable,
  isFull,
  isQueuedBy,
  myAttendee,
  placesRemaining,
  queuePosition,
  queuedCount,
  upcomingClassIds,
} from '../server/utils/gladstone'

const MINE = '/gs/contacts/8035356'

const attendee = (contactId: string, over: Partial<Attendee> = {}): Attendee => ({
  '@id': '/gs/sessions/1',
  contactId,
  ...over,
})

const event = (over: Partial<ClassEvent> = {}): ClassEvent => ({
  '@id': '/gs/sessions/80299534',
  sessionId: 80299534,
  title: 'Strength Development',
  ...over,
})

describe('active bookings', () => {
  it('treats a missing state as active', () => {
    // A place the timetable hands back carries no cancelled state, so a missing
    // one means the booking stands.
    expect(isActive(attendee(MINE))).toBe(true)
  })

  it('accepts both spellings of cancelled', () => {
    expect(isActive(attendee(MINE, { state: 'canceled' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'cancelled' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'refused' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'booked' }))).toBe(true)
    expect(isActive(attendee(MINE, { state: 'queued' }))).toBe(true)
  })

  it('only allows cancelling while the club still offers it', () => {
    // `cancelDelayOver` is set from the session's own `showCancel`.
    expect(isCancellable(attendee(MINE, { state: 'booked' }))).toBe(true)
    expect(isCancellable(attendee(MINE, { state: 'booked', cancelDelayOver: true }))).toBe(false)
    expect(isCancellable(attendee(MINE, { state: 'canceled' }))).toBe(false)
  })
})

describe('seats versus waiting-list places', () => {
  it('reads the member\'s own state from the session', () => {
    const seat = event({ myBookingStatus: 'Booked' })
    const queue = event({ myBookingStatus: 'BookedWaitingList' })

    expect(isBookedBy(seat, MINE)).toBe(true)
    expect(isQueuedBy(seat, MINE)).toBe(false)

    expect(isBookedBy(queue, MINE)).toBe(false)
    expect(isQueuedBy(queue, MINE)).toBe(true)
  })

  it('counts a paid booking as a seat', () => {
    // What KAL actually returns once a class has been paid for, which is most
    // of them.
    const paid = event({ myBookingStatus: 'BookedPaid' })
    expect(isBookedBy(paid, MINE)).toBe(true)
    expect(isQueuedBy(paid, MINE)).toBe(false)
    expect(myAttendee(paid, MINE)?.state).toBe('booked')
  })

  it('does not report a seat for someone only on the waiting list', () => {
    const queue = event({ myBookingStatus: 'BookedWaitingList' })
    expect(isBookedBy(queue, MINE)).toBe(false)
  })

  it('synthesises an attendee only when the member holds a place', () => {
    expect(myAttendee(event({ myBookingStatus: 'Booked' }), MINE)?.state).toBe('booked')
    expect(myAttendee(event({ myBookingStatus: 'BookedWaitingList' }), MINE)?.state).toBe('queued')
    expect(myAttendee(event({ myBookingStatus: 'Unbooked' }), MINE)).toBeUndefined()
    expect(myAttendee(event(), MINE)).toBeUndefined()
  })

  it('points a synthesised attendee at the session, to cancel by', () => {
    const attendee = myAttendee(event({ myBookingStatus: 'Booked' }), MINE)
    expect(attendee?.['@id']).toBe('/gs/sessions/80299534')
  })

  it('reads queue position from the session, when the club reports one', () => {
    expect(queuePosition(event({ myBookingStatus: 'BookedWaitingList', waitListPos: 3 }), MINE)).toBe(3)
    // Gladstone does not always publish a position.
    expect(queuePosition(event({ myBookingStatus: 'BookedWaitingList' }), MINE)).toBeNull()
    // Not on the waiting list at all.
    expect(queuePosition(event({ myBookingStatus: 'Booked', waitListPos: 3 }), MINE)).toBeNull()
  })
})

describe('capacity', () => {
  it('reads the places left from the session', () => {
    expect(placesRemaining(event({ slotsAvailable: 5 }))).toBe(5)
    expect(isFull(event({ slotsAvailable: 5 }))).toBe(false)
    expect(placesRemaining(event({ slotsAvailable: 0 }))).toBe(0)
    expect(isFull(event({ slotsAvailable: 0 }))).toBe(true)
  })

  it('is not full when it has no idea', () => {
    expect(placesRemaining(event())).toBeNull()
    expect(isFull(event())).toBe(false)
  })

  it('offers the waiting list only when full and still accepting queuers', () => {
    // Full, and the club still offers "book" (which joins the waiting list).
    expect(hasQueueSpace(event({ slotsAvailable: 0, showBook: true }))).toBe(true)
    // Full, but the club is no longer offering it.
    expect(hasQueueSpace(event({ slotsAvailable: 0, showBook: false }))).toBe(false)
    // Seats left, so there is nothing to queue for.
    expect(hasQueueSpace(event({ slotsAvailable: 2, showBook: true }))).toBe(false)
  })
})

describe('waiting-list size', () => {
  it('reads the count from the session', () => {
    expect(queuedCount(event({ waitListCount: 6 }))).toBe(6)
    expect(queuedCount(event({ waitListCount: 0 }))).toBe(0)
  })

  it('is unknown when the session says nothing about a queue', () => {
    expect(queuedCount(event())).toBeNull()
  })
})

describe('upcoming classes', () => {
  const booking = (id: string, start: string, state: string): Attendee =>
    attendee(MINE, {
      '@id': id,
      state,
      classEvent: event({ '@id': id, startedAt: start }),
    })

  it('excludes the past, cancellations and waiting-list places', () => {
    const now = '2026-08-15T12:00:00'

    const upcoming = upcomingClassIds(
      [
        booking('/gs/sessions/1', '2026-08-20T09:00:00', 'booked'),
        booking('/gs/sessions/2', '2026-08-14T09:00:00', 'booked'),
        booking('/gs/sessions/3', '2026-08-20T10:00:00', 'canceled'),
        booking('/gs/sessions/4', '2026-08-20T11:00:00', 'queued'),
      ],
      now,
    )

    expect([...upcoming]).toEqual(['/gs/sessions/1'])
  })
})
