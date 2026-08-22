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
import { today } from '#shared/naive'
import { invalidatePlanning } from '../../utils/planning'
import { isActive } from '../../utils/resamania'
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

  await client.cancel(booking['@id'])

  invalidatePlanning()
  await syncMember(subject).catch(error => {
    console.error('Post-cancellation sync failed', error)
  })

  return { ok: true, forContactId: subject.contactId, forName: memberName(subject) }
})
