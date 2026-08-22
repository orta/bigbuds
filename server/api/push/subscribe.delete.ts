/**
 * Forgets one device.
 *
 * Deliberately per-device rather than per-member: turning notifications off on
 * a laptop is not a statement about the phone in your pocket.
 */

import { z } from 'zod'
import { removeSubscription } from '../../utils/push'
import { requireMember } from '../../utils/session'

const Body = z.object({ endpoint: z.string().url() })

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { endpoint } = await readValidatedBody(event, Body.parse)

  await removeSubscription(member.contactId, endpoint)

  return { ok: true }
})
