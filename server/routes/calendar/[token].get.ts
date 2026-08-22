/**
 * The calendar feed, at `/calendar/<token>.ics`.
 *
 * Outside `/api` and outside the session entirely: a calendar client sends no
 * cookie and cannot be asked for one, so the token in the path is what
 * identifies the member — see `server/utils/calendar.ts` for what that costs
 * and why it is nonetheless the only way this can work.
 *
 * The `.ics` on the end is not decoration. Several clients — Outlook most
 * insistently — decide whether a URL is a calendar by looking at it before
 * they fetch it, and refuse one that does not end this way.
 */

import { buildFeed } from '../../utils/calendar'
import { readMemberByCalendarToken } from '../../utils/store'

export default defineEventHandler(async event => {
  const token = (getRouterParam(event, 'token') ?? '').replace(/\.ics$/i, '')

  const member = token ? await readMemberByCalendarToken(token) : undefined

  // The same answer for a token that never existed and one that has been
  // reset. There is nothing here to tell apart, and a distinct message would
  // turn the URL into a way of asking whether a feed exists.
  if (!member) throw createError({ statusCode: 404, statusMessage: 'No such calendar' })

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  // A subscription rather than a download, so no `attachment` disposition —
  // but name it anyway, for the clients that save a copy.
  setHeader(event, 'content-disposition', 'inline; filename="bigbuds.ics"')
  // Somebody else's schedule has no business in a shared cache, and the feed
  // changes as often as the sync runs.
  setHeader(event, 'cache-control', 'private, no-store')

  return buildFeed(member)
})
