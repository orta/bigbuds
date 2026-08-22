/**
 * Acknowledges every promotion currently being shown.
 *
 * Driven by the member dismissing the banner rather than by the banner
 * rendering. "You are in" is the one thing this app tells anybody that they
 * cannot find out anywhere else, and marking it read because a page happened
 * to load is how somebody misses it.
 */

import { markPromotionsSeen } from '../../utils/members'
import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  await markPromotionsSeen(member.contactId)

  return { ok: true }
})
