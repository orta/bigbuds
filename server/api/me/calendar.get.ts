/**
 * The member's own feed URL, if they have one.
 *
 * A separate read rather than a field on the session, because the token is a
 * bearer credential and the session cookie is the one thing in this app that
 * is handed to the browser and kept there for a month. It is fetched by the
 * settings page, which is the only page that shows it.
 */

import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)

  return { path: member.calendarToken ? `/calendar/${member.calendarToken}.ics` : null }
})
