/**
 * The KAL centres a member can choose to see classes from, and which they
 * see now.
 */

import { siteIdOf } from '../utils/gladstone'
import { clientFor } from '../utils/members'
import { getSites, sitesFor } from '../utils/planning'
import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const sites = await getSites(await clientFor(member))
  const home = siteIdOf(member.clubId) || null

  return {
    sites: sites.map(site => ({ ...site, home: site.id === home })),
    /** What the timetable shows right now, so the settings page starts true. */
    chosen: sitesFor(member),
  }
})
