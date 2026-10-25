/**
 * Turns auto-accept on or off for a waiting-list place.
 *
 * A PUT because it sets a state rather than doing something: sending it twice
 * leaves the same answer.
 *
 * `forContactId` sets it on somebody else's place. The same grant that lets
 * the viewer put them on the list covers getting them off it: the claim is
 * the booking they would otherwise make by hand the moment the club's email
 * arrived, made sooner. The opt-in is stored on the *subject's* record, since
 * it is their place and their credentials the sync books with, and it is
 * dropped the same way — once tried, or once they stop waiting.
 */

import { z } from 'zod'
import { QUEUED } from '#shared/promotions'
import { setAutoAccept } from '../../utils/members'
import { requireMember, requireSubject } from '../../utils/session'

const Body = z.object({
  classEventId: z.string().min(1),
  on: z.boolean(),
  /** Contact IRI of the member whose place this is, when it is not the viewer. */
  forContactId: z.string().min(1).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { classEventId, on, forContactId } = await readValidatedBody(event, Body.parse)

  const subject = await requireSubject(member, forContactId)

  // Against the snapshot, which the booking that joined the list has already
  // refreshed. An id that is not a place the member holds would sit in their
  // file doing nothing until the next sync pruned it.
  const waiting = subject.bookings.some(booking =>
    booking.classEventId === classEventId && booking.state === QUEUED)
  if (on && !waiting) {
    throw createError({
      statusCode: 400,
      statusMessage: subject === member
        ? 'You are not on the waiting list for that class.'
        : 'They are not on the waiting list for that class.',
    })
  }

  const updated = await setAutoAccept(subject.contactId, classEventId, on)
  return { autoAccept: updated.autoAccept.includes(classEventId) }
})
