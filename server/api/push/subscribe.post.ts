/**
 * Registers a device to receive notifications.
 *
 * The browser has already asked the member for permission and been given a
 * subscription by its push service by the time this is called; all this does
 * is remember which member it belongs to.
 */

import { z } from 'zod'
import { addSubscription, pushConfigured } from '../../utils/push'
import { requireMember } from '../../utils/session'

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    /** The device's public key, base64url. */
    p256dh: z.string().min(1),
    /** Its auth secret, likewise. */
    auth: z.string().min(1),
  }),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  // A subscription this deployment could never send to is worse than none: it
  // would leave the switch on and the member expecting messages.
  if (!pushConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Notifications are not set up on this server.',
    })
  }

  const subscription = await readValidatedBody(event, Body.parse)
  await addSubscription(member.contactId, subscription)

  return { ok: true }
})
