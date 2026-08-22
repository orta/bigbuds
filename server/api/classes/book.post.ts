/**
 * Books a class, or joins its waiting list.
 *
 * These are the same request — the server decides based on whether seats are
 * left and answers `state: "queued"` when they are not. So the response tells
 * the member which of the two actually happened rather than assuming a seat.
 *
 * `forContactId` books somebody else in. That is only possible because this
 * app already holds every member's own BigBox login for the background sync:
 * the booking is made *as them*, by their own client, and looks to the club
 * exactly like one they made themselves. Whether it is allowed is settled by
 * `requireSubject` against their grant list, never by what the browser sent.
 */

import { z } from 'zod'
import { clientFor, memberName, syncMember } from '../../utils/members'
import { isQueued } from '../../utils/resamania'
import { invalidatePlanning } from '../../utils/planning'
import { requireMember, requireSubject } from '../../utils/session'

const Body = z.object({
  classEventId: z.string().min(1),
  /** Contact IRI of the member to book, when it is not the viewer. */
  forContactId: z.string().min(1).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { classEventId, forContactId } = await readValidatedBody(event, Body.parse)

  const subject = await requireSubject(member, forContactId)
  const client = await clientFor(subject)
  const attendee = await client.book(classEventId)

  invalidatePlanning()
  await syncMember(subject).catch(error => {
    // The booking itself succeeded; a failed snapshot only delays other
    // members seeing it, and the scheduled sync will pick it up.
    console.error('Post-booking sync failed', error)
  })

  return {
    attendeeId: attendee['@id'],
    queued: isQueued(attendee),
    /** Who it was for, so the browser can say so rather than assume. */
    forContactId: subject.contactId,
    forName: memberName(subject),
  }
})
