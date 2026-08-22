/** Everyone who has signed into this app and left themselves visible. */

import { memberSummaries, whoCanBookYou } from '../utils/members'
import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  const [members, canBookYou] = await Promise.all([
    memberSummaries(member.contactId),
    // Separate from `members` because it is not filtered by visibility: a
    // permission you granted has to stay revocable even if that person has
    // since dropped off the People page.
    whoCanBookYou(member.contactId),
  ])

  return { members, canBookYou }
})
