/**
 * Cancels a booking or gives up a waiting-list place — the same transition
 * either way.
 *
 * Whoever it is for, the attendee record is looked up in *their* own live
 * bookings before anything is cancelled. That is the whole authorisation
 * story for the id: this endpoint can only ever act on a booking the subject
 * actually holds, so an id from somewhere else finds nothing.
 */

import { z } from 'zod'
import { clientFor, memberName, syncMember } from '../../utils/members'
import { announce } from '../../utils/notices'
import { today } from '#shared/naive'
import { getDirectory, invalidatePlanning } from '../../utils/planning'
import { activityName, classStart, isActive } from '../../utils/gladstone'
import { requireMember, requireSubject } from '../../utils/session'

const Body = z.object({
  /** The attendee IRI, when the browser has one. */
  attendeeId: z.string().min(1).optional(),
  /**
   * The class instead, for cancelling on somebody else's behalf: their
   * attendee IRI is theirs to know, and the timetable never carries it.
   */
  classEventId: z.string().min(1).optional(),
  forContactId: z.string().min(1).optional(),
}).refine(body => body.attendeeId || body.classEventId, {
  message: 'Either attendeeId or classEventId is required.',
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { attendeeId, classEventId, forContactId } = await readValidatedBody(event, Body.parse)

  const subject = await requireSubject(member, forContactId)
  const client = await clientFor(subject)

  const attendees = await client.bookingsFrom(today())
  const booking = attendees.filter(isActive).find(attendee =>
    attendeeId
      ? attendee['@id'] === attendeeId
      : attendee.classEvent?.['@id'] === classEventId)

  if (!booking) {
    throw createError({
      statusCode: 403,
      statusMessage: subject.contactId === member.contactId
        ? 'That booking is not yours.'
        : `${memberName(subject)} does not hold that place.`,
    })
  }

  // Read before cancelling it away: afterwards the booking is gone from the
  // member's own list and there is nothing left to name the class from.
  const classEvent = booking.classEvent
  const start = classEvent ? classStart(classEvent) : null
  const name = classEvent
    ? activityName(await getDirectory(client), classEvent) ?? 'a class'
    : 'a class'

  await client.cancel(booking['@id'])

  invalidatePlanning()
  await syncMember(subject).catch(error => {
    console.error('Post-cancellation sync failed', error)
  })

  /**
   * The mirror of booking for somebody. Arguably the more important half: a
   * class quietly disappearing from your schedule is worse than one quietly
   * appearing, because you find out by not going.
   */
  if (subject.contactId !== member.contactId && classEvent && start) {
    await announce(subject.contactId, {
      kind: 'cancelled-for-you',
      classEventId: classEvent['@id'],
      name,
      startedAt: start,
      by: memberName(member),
      noticedAt: new Date().toISOString(),
      seen: false,
    })
  }

  return { ok: true, forContactId: subject.contactId, forName: memberName(subject) }
})
