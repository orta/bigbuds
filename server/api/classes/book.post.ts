/**
 * Books a class, or joins its waiting list.
 *
 * These are the same request — the server decides based on whether seats are
 * left and answers `state: "queued"` when they are not. So the response tells
 * the member which of the two actually happened rather than assuming a seat.
 */

import { z } from 'zod'
import { clientFor, syncMember } from '../../utils/members'
import { isQueued } from '../../utils/resamania'
import { invalidatePlanning } from '../../utils/planning'
import { requireMember } from '../../utils/session'

const Body = z.object({
  classEventId: z.string().min(1),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { classEventId } = await readValidatedBody(event, Body.parse)

  const client = await clientFor(member)
  const attendee = await client.book(classEventId)

  invalidatePlanning()
  await syncMember(member).catch(error => {
    // The booking itself succeeded; a failed snapshot only delays other
    // members seeing it, and the scheduled sync will pick it up.
    console.error('Post-booking sync failed', error)
  })

  return {
    attendeeId: attendee['@id'],
    queued: isQueued(attendee),
  }
})
