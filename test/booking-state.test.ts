/**
 * Capacity and booking-state logic, ported from the Rust `api` tests.
 *
 * These are the rules that decide what a member is told about a class, and
 * every one of them has a way of being wrong that reads as plausible: showing
 * a seat to someone who only has a queue place, counting a cancellation as a
 * booking, or offering a waiting list that is itself full.
 */

import { describe, expect, it } from 'vitest'
import type { Attendee, ClassEvent } from '../server/utils/resamania'
import {
  hasQueueSpace,
  isActive,
  isBookedBy,
  isCancellable,
  isFull,
  isQueued,
  isQueuedBy,
  myAttendee,
  placesRemaining,
  queuePosition,
  queuedCount,
  upcomingClassIds,
} from '../server/utils/resamania'

const MINE = '/bigbox/contacts/2327536'

const attendee = (contactId: string, over: Partial<Attendee> = {}): Attendee => ({
  '@id': '/bigbox/attendees/1',
  contactId,
  ...over,
})

const event = (over: Partial<ClassEvent> = {}): ClassEvent => ({
  '@id': '/bigbox/class_events/1722803',
  ...over,
})

describe('active bookings', () => {
  it('treats a missing state as active', () => {
    // Attendees embedded in a class listing carry no state, and the API only
    // lists live ones there.
    expect(isActive(attendee(MINE))).toBe(true)
  })

  it('accepts both spellings of cancelled', () => {
    // The member web app's own bundle uses them interchangeably.
    expect(isActive(attendee(MINE, { state: 'canceled' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'cancelled' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'refused' }))).toBe(false)
    expect(isActive(attendee(MINE, { state: 'booked' }))).toBe(true)
    expect(isActive(attendee(MINE, { state: 'queued' }))).toBe(true)
  })

  it('only allows cancelling before the club\'s deadline', () => {
    expect(isCancellable(attendee(MINE, { state: 'booked' }))).toBe(true)
    expect(isCancellable(attendee(MINE, { state: 'booked', cancelDelayOver: true }))).toBe(false)
    expect(isCancellable(attendee(MINE, { state: 'canceled' }))).toBe(false)
  })
})

describe('seats versus waiting-list places', () => {
  it('does not report a seat for someone who is only queued', () => {
    const class_ = event({
      bookedAttendees: [attendee('/bigbox/contacts/1')],
      queuedAttendees: [attendee(MINE)],
    })

    expect(isBookedBy(class_, MINE)).toBe(false)
    expect(isQueuedBy(class_, MINE)).toBe(true)
  })

  it('does not count a cancelled booking as a seat', () => {
    const class_ = event({
      bookedAttendees: [attendee(MINE, { state: 'canceled' })],
    })

    expect(isBookedBy(class_, MINE)).toBe(false)
    // The record is still findable, which is what makes it cancellable-safe.
    expect(myAttendee(class_, MINE)).toBeDefined()
  })

  it('finds the attendee in either list', () => {
    const booked = event({ bookedAttendees: [attendee(MINE, { '@id': '/bigbox/attendees/7' })] })
    const queued = event({ queuedAttendees: [attendee(MINE, { '@id': '/bigbox/attendees/9' })] })

    expect(myAttendee(booked, MINE)?.['@id']).toBe('/bigbox/attendees/7')
    expect(myAttendee(queued, MINE)?.['@id']).toBe('/bigbox/attendees/9')
    expect(myAttendee(event(), MINE)).toBeUndefined()
  })

  it('reads queue position from the order the API returns', () => {
    const class_ = event({
      queuedAttendees: [
        attendee('/bigbox/contacts/1'),
        attendee('/bigbox/contacts/2'),
        attendee(MINE),
      ],
    })

    expect(queuePosition(class_, MINE)).toBe(3)
    expect(queuePosition(class_, '/bigbox/contacts/1')).toBe(1)
    expect(queuePosition(class_, '/bigbox/contacts/99')).toBeNull()
  })
})

describe('capacity', () => {
  it('prefers the online allowance over the overall one', () => {
    // A class can have seats left that online members may not take.
    expect(placesRemaining(event({ attendeeRemaining: 5, onlineAttendeeRemaining: 0 }))).toBe(0)
    expect(isFull(event({ attendeeRemaining: 5, onlineAttendeeRemaining: 0 }))).toBe(true)
  })

  it('falls back to the overall count when there is no online cap', () => {
    expect(placesRemaining(event({ attendeeRemaining: 3 }))).toBe(3)
    expect(isFull(event({ attendeeRemaining: 3 }))).toBe(false)
  })

  it('is not full when it has no idea', () => {
    expect(placesRemaining(event())).toBeNull()
    expect(isFull(event())).toBe(false)
  })

  it('offers the waiting list only when full and the list has room', () => {
    expect(hasQueueSpace(event({ onlineAttendeeRemaining: 0, queueRemaining: 4 }))).toBe(true)
    // Full, and so is the queue.
    expect(hasQueueSpace(event({ onlineAttendeeRemaining: 0, queueRemaining: 0 }))).toBe(false)
    // Seats left, so there is nothing to queue for.
    expect(hasQueueSpace(event({ onlineAttendeeRemaining: 2, queueRemaining: 4 }))).toBe(false)
  })
})

describe('waiting-list size', () => {
  it('counts the attendee list when the class carries one', () => {
    const class_ = event({
      queuedAttendees: [attendee('/bigbox/contacts/1'), attendee('/bigbox/contacts/2')],
      // Deliberately disagreeing counters: the array is what the displayed
      // queue position indexes into, so it has to win.
      queueLimit: 10,
      queueRemaining: 1,
    })

    expect(queuedCount(class_)).toBe(2)
  })

  it('never contradicts the position shown beside it', () => {
    const class_ = event({
      queuedAttendees: [
        attendee('/bigbox/contacts/1'),
        attendee('/bigbox/contacts/2'),
        attendee(MINE),
      ],
    })

    const position = queuePosition(class_, MINE)!
    expect(position).toBeLessThanOrEqual(queuedCount(class_)!)
  })

  it('falls back to the counters when there is no attendee list', () => {
    // This is the shape embedded in a booking: no lists, only counters.
    expect(queuedCount(event({ queueLimit: 10, queueRemaining: 4 }))).toBe(6)
    expect(queuedCount(event({ queueLimit: 10, queueRemaining: 10 }))).toBe(0)
  })

  it('never reports a negative queue', () => {
    expect(queuedCount(event({ queueLimit: 2, queueRemaining: 5 }))).toBe(0)
  })

  it('is unknown when the class says nothing about a queue', () => {
    expect(queuedCount(event())).toBeNull()
    expect(queuedCount(event({ queueLimit: 10 }))).toBeNull()
    expect(queuedCount(event({ queueRemaining: 4 }))).toBeNull()
  })

  it('reads an empty list as an empty queue, not an unknown one', () => {
    expect(queuedCount(event({ queuedAttendees: [] }))).toBe(0)
  })
})

describe('upcoming classes', () => {
  const booking = (id: string, start: string, state: string): Attendee =>
    attendee(MINE, { state, classEvent: event({ '@id': id, startedAt: start }) })

  it('excludes the past, cancellations and waiting-list places', () => {
    const now = '2026-08-15T12:00:00'

    const upcoming = upcomingClassIds(
      [
        booking('/bigbox/class_events/1', '2026-08-20T09:00:00', 'booked'),
        booking('/bigbox/class_events/2', '2026-08-14T09:00:00', 'booked'),
        booking('/bigbox/class_events/3', '2026-08-20T10:00:00', 'canceled'),
        booking('/bigbox/class_events/4', '2026-08-20T11:00:00', 'queued'),
      ],
      now,
    )

    expect([...upcoming]).toEqual(['/bigbox/class_events/1'])
  })

  it('keeps a class starting exactly now', () => {
    const upcoming = upcomingClassIds(
      [booking('/bigbox/class_events/1', '2026-08-15T12:00:00', 'booked')],
      '2026-08-15T12:00:00',
    )

    expect(upcoming.size).toBe(1)
  })

  it('ignores attendees with no embedded class', () => {
    expect(upcomingClassIds([attendee(MINE, { state: 'booked' })], '2026-08-15T12:00:00').size)
      .toBe(0)
  })
})

describe('booking result', () => {
  it('distinguishes a seat from a waiting-list place', () => {
    // Booking and joining the waiting list are the same request; only the
    // response says which happened.
    expect(isQueued(attendee(MINE, { state: 'queued' }))).toBe(true)
    expect(isQueued(attendee(MINE, { state: 'booked' }))).toBe(false)
  })
})
