/**
 * Sends a notification to every device the member has turned them on for.
 *
 * Real news only arrives when a waiting-list space opens, which can be days
 * away — far too late to find out that a phone was never going to show it.
 * This is the way to find out now.
 */

import { notify, pushConfigured } from '../../utils/push'
import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  if (!pushConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Notifications are not set up on this server.' })
  }

  const sent = await notify(member, {
    title: 'Notifications are working',
    body: 'This is what it looks like when a space opens on a class you are waiting for.',
    tag: 'test',
    url: '/settings',
  })

  return { sent }
})
