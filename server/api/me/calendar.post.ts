/**
 * Issues the member a calendar feed URL, or replaces the one they have.
 *
 * One endpoint for both because they are the same act: the member wants a URL
 * that works, and the old one either did not exist or should stop working.
 */

import { issueCalendarToken } from '../../utils/calendar'
import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const token = await issueCalendarToken(member.contactId)

  return { path: `/calendar/${token}.ics` }
})
