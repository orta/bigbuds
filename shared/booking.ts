/**
 * How far ahead the club takes bookings.
 *
 * The API will happily serve planning months out, so nothing in the response
 * says where booking stops — the limit is club policy, applied when the
 * booking POST arrives. Offering days beyond it is worse than not showing
 * them: the row says places are free, the Book button looks live, and the
 * request comes back refused, which reads as this app being broken rather
 * than as the club not being open for that date yet.
 *
 * Eight days, counted from the club's own date: on Wednesday the 19th the
 * furthest bookable class is on Thursday the 27th. The club describes that as
 * "a week ahead" and is a day out; the observed behaviour is what is encoded.
 */

import { addDays, type NaiveDate } from './naive'

export const BOOKING_DAYS_AHEAD = 8

/** The last date the club will take a booking for, given its today. */
export function lastBookableDate(today: NaiveDate): NaiveDate {
  return addDays(today, BOOKING_DAYS_AHEAD)
}

/** Every date a member can book on, today first. */
export function bookableDays(today: NaiveDate): NaiveDate[] {
  return Array.from({ length: BOOKING_DAYS_AHEAD + 1 }, (_, offset) => addDays(today, offset))
}
