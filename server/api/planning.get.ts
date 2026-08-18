/**
 * The club's timetable for one day, with everything a member needs to decide.
 *
 * This is where the app earns its name: BigBox's own response is merged with
 * the bookings other members have shared here, so each class carries an
 * "also going" list.
 */

import { z } from 'zod'
import { CATEGORIES, lookupClass } from '#shared/categories'
import { alsoGoing, clientFor } from '../utils/members'
import { addDays, naiveNow, today } from '#shared/naive'
import type { ClassRow } from '#shared/types'
import { getDirectory, getPlanning } from '../utils/planning'
import { resolve } from '../utils/resamania'
import { requireMember } from '../utils/session'

const Query = z.object({
  /** `YYYY-MM-DD`; defaults to today at the club. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { date } = await getValidatedQuery(event, Query.parse)

  const from = date ?? today()
  const client = await clientFor(member)

  const [directory, events] = await Promise.all([
    getDirectory(client),
    // `to` is exclusive, so this is exactly one day.
    getPlanning(client, member.clubId, from, addDays(from, 1)),
  ])

  const now = naiveNow()
  const entries: ClassRow[] = events.map(classEvent => {
    const entry = resolve(directory, classEvent, member.contactId)
    const info = lookupClass(entry.name)

    return {
      ...entry,
      category: info.category,
      categoryLabel: CATEGORIES[info.category].label,
      tags: info.tags,
      /**
       * A class that has already started. Kept in the list rather than
       * filtered out — the day reads as a whole with them there — but the UI
       * dims them so they do not look bookable.
       */
      finished: entry.start !== null && entry.start < now,
      going: [],
    }
  })

  const going = await alsoGoing(entries.map(entry => entry.id), member.contactId)
  for (const entry of entries) entry.going = going[entry.id] ?? []

  return {
    date: from,
    now,
    club: entries.find(entry => entry.club)?.club ?? null,
    entries,
  }
})
