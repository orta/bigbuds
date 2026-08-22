/**
 * Waiting-list places the member has been given and not yet acknowledged.
 *
 * The in-app half of the promotion notice. Push is best-effort — it needs
 * permission, it needs the app on the home screen for iOS to allow it at all,
 * and a message can simply not arrive — so this is what makes the feature true
 * for everybody rather than only for people whose phones cooperated.
 */

import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  return {
    promotions: member.promotions
      .filter(promotion => !promotion.seen)
      // Soonest class first: if two places came up, the one to plan around is
      // the one that happens first.
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  }
})
