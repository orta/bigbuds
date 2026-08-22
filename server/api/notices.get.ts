/**
 * Things that happened to this member's bookings and have not been seen.
 *
 * The in-app half of the notification. Push is best-effort — it needs
 * permission, it needs the app on the home screen before iOS will allow it at
 * all, and a message can simply not arrive — so this is what makes the feature
 * true for everybody rather than only for people whose phones cooperated.
 */

import { currentNotices } from '#shared/notices'
import { naiveNow } from '#shared/naive'
import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  return {
    // Pruned on read as well as on write: a member who leaves a tab open
    // overnight should not be shown this morning's news this evening.
    notices: currentNotices(member.notices, naiveNow()).filter(notice => !notice.seen),
  }
})
