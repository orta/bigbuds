/** Everyone who has signed into this app and left themselves visible. */

import { allMembers } from '../utils/members'
import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  return { members: await allMembers(member.contactId) }
})
