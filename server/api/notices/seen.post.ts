/**
 * Acknowledges a notice, or all of them.
 *
 * Driven by the member dismissing the banner rather than by the banner
 * rendering. These are the things this app tells people that they cannot find
 * out anywhere else, and marking one read because a page happened to load is
 * exactly how somebody misses it.
 */

import { z } from 'zod'
import { markNoticesSeen } from '../../utils/members'
import { requireMember } from '../../utils/session'

const Body = z.object({
  /** Dismiss one class's notice. Omitted, it dismisses everything shown. */
  classEventId: z.string().min(1).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { classEventId } = await readValidatedBody(event, Body.parse)

  await markNoticesSeen(member.contactId, classEventId)

  return { ok: true }
})
