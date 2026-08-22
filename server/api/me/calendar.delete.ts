/** Withdraws the member's calendar feed. Anything subscribed to it gets a 404. */

import { revokeCalendarToken } from '../../utils/calendar'
import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  await revokeCalendarToken(member.contactId)

  return { path: null }
})
