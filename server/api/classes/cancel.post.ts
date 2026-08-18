/**
 * Cancels a booking or gives up a waiting-list place — the same transition
 * either way.
 */

import { z } from 'zod'
import { clientFor, syncBookings } from '../../utils/members'
import { today } from '#shared/naive'
import { invalidatePlanning } from '../../utils/planning'
import { requireMember } from '../../utils/session'

const Body = z.object({
  attendeeId: z.string().min(1),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { attendeeId } = await readValidatedBody(event, Body.parse)

  // The attendee IRI came from this member's own resolved planning entry, but
  // it arrives back from the browser, so check it is theirs before acting on
  // it — otherwise this endpoint would cancel any booking at the club given
  // its id.
  const client = await clientFor(member)
  const attendees = await client.bookingsFrom(today())
  const mine = attendees.some(attendee => attendee['@id'] === attendeeId)

  if (!mine) {
    throw createError({ statusCode: 403, statusMessage: 'That booking is not yours.' })
  }

  await client.cancel(attendeeId)

  invalidatePlanning()
  await syncBookings(member).catch(error => {
    console.error('Post-cancellation sync failed', error)
  })

  return { ok: true }
})
