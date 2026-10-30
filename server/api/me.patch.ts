/** Updates the member's own sharing settings. */

import { z } from 'zod'
import { CATEGORY_ORDER } from '#shared/categories'
import { clientFor, updateSettings } from '../utils/members'
import { getSites } from '../utils/planning'
import { readMembers } from '../utils/store'
import { requireMember, sessionUser } from '../utils/session'

const Body = z.object({
  visible: z.boolean().optional(),
  shareEntries: z.boolean().optional(),
  /** Contact IRIs of members allowed to book this member onto classes. */
  bookableBy: z.array(z.string()).optional(),
  // Validated against the known keys so an unknown one cannot be stored and
  // then silently hide nothing forever.
  hiddenCategories: z.array(z.enum(CATEGORY_ORDER as [string, ...string[]])).optional(),
  hideFinished: z.boolean().optional(),
  hideVirtual: z.boolean().optional(),
  /** Bare site ids, e.g. `CVLC`. */
  sites: z.array(z.string()).optional(),
  /** Activity IRIs of starred class types, e.g. `/gs/activities/body-pump`. */
  favourites: z.array(z.string()).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const settings = await readValidatedBody(event, Body.parse)

  if (settings.bookableBy) {
    /**
     * Only real members, each at most once, and never the member themselves.
     *
     * Booking rights are the one setting here that another person can act on,
     * so what is stored has to be a list of people rather than whatever the
     * browser sent — a stale id would sit in the file looking like a granted
     * permission, and a self-grant would make `mayBookFor` ambiguous.
     */
    const known = new Set((await readMembers()).map(other => other.contactId))
    settings.bookableBy = [...new Set(settings.bookableBy)]
      .filter(contactId => contactId !== member.contactId && known.has(contactId))
  }

  if (settings.sites) {
    // Only centres that exist, so a stale id cannot leave somebody with a
    // timetable filtered down to nothing and no visible reason why.
    const known = new Set((await getSites(await clientFor(member))).map(site => site.id))
    settings.sites = [...new Set(settings.sites)].filter(id => known.has(id))
  }

  if (settings.favourites) {
    // Not checked against the club's activity list, which would cost a
    // round trip to KAL for a preference that hurts nobody if stale: a star
    // on a class the club has dropped simply never matches a row again.
    settings.favourites = [...new Set(settings.favourites)]
  }

  const updated = await updateSettings(member.contactId, settings)

  await setUserSession(event, { user: sessionUser(updated) })
  return { user: sessionUser(updated) }
})
