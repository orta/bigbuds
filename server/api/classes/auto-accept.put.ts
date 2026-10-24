/**
 * Turns auto-accept on or off for one of the viewer's waiting-list places.
 *
 * A PUT because it sets a state rather than doing something: sending it twice
 * leaves the same answer. Only the viewer's own places — booking a buddy off a
 * waiting list on a timer is a step further than they agreed to.
 */

import { z } from 'zod'
import { QUEUED } from '#shared/promotions'
import { setAutoAccept } from '../../utils/members'
import { requireMember } from '../../utils/session'

const Body = z.object({
  classEventId: z.string().min(1),
  on: z.boolean(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { classEventId, on } = await readValidatedBody(event, Body.parse)

  // Against the snapshot, which the booking that joined the list has already
  // refreshed. An id that is not a place the member holds would sit in their
  // file doing nothing until the next sync pruned it.
  const waiting = member.bookings.some(booking =>
    booking.classEventId === classEventId && booking.state === QUEUED)
  if (on && !waiting) {
    throw createError({ statusCode: 400, statusMessage: 'You are not on the waiting list for that class.' })
  }

  const updated = await setAutoAccept(member.contactId, classEventId, on)
  return { autoAccept: updated.autoAccept.includes(classEventId) }
})
