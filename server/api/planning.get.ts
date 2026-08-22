/**
 * The club's timetable for one day, with everything a member needs to decide.
 *
 * This is where the app earns its name: BigBox's own response is merged with
 * what other members have shared here — the classes they are booked onto, and
 * the hours they are usually at the club.
 */

import { CATEGORIES, lookupClass } from '#shared/categories'
import { addDays, naiveNow, today } from '#shared/naive'
import type { ClassRow } from '#shared/types'
import { alsoGoing, bookingBuddies, clientFor, isAround, regularsOn } from '../utils/members'
import { noteCounts } from '../utils/notes'
import { getDirectory, getPlanning } from '../utils/planning'
import { resolve } from '../utils/resamania'
import { requireMember } from '../utils/session'
import { readMembers } from '../utils/store'
import { z } from 'zod'

const Query = z.object({
  /** `YYYY-MM-DD`; defaults to today at the club. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { date } = await getValidatedQuery(event, Query.parse)

  const from = date ?? today()
  const client = await clientFor(member)

  const [directory, events, regulars, buddies, everyone] = await Promise.all([
    getDirectory(client),
    // `to` is exclusive, so this is exactly one day.
    getPlanning(client, member.clubId, from, addDays(from, 1)),
    regularsOn(from, member.contactId),
    // The people who have asked this member to book for them.
    bookingBuddies(member.contactId),
    readMembers(),
  ])

  const now = naiveNow()
  const notes = noteCounts(everyone)

  const entries: ClassRow[] = events.map(classEvent => {
    const entry = resolve(directory, classEvent, member.contactId)
    const info = lookupClass(entry.name)
    const attended = entry.activityId ? member.attended[entry.activityId] : undefined

    return {
      ...entry,
      category: info.category,
      categoryLabel: CATEGORIES[info.category].label,
      tags: info.tags,
      /**
       * A class that has already started. Kept in the response rather than
       * filtered out — the member decides whether to see them — but the UI
       * dims them so they never look bookable.
       */
      finished: entry.start !== null && entry.start < now,
      attendedCount: attended?.count ?? 0,
      attendedLast: attended?.lastAt ?? null,
      noteCount: entry.activityId ? (notes[entry.activityId] ?? 0) : 0,
      going: [],
      around: entry.start
        ? regulars.filter(regular => isAround(regular, entry.start!))
        : [],
      /**
       * Which of those people already hold a place here.
       *
       * From the snapshot rather than live: fetching each buddy's bookings on
       * every timetable load would be a round trip per person per day. It can
       * therefore lag a booking made in the club's own app by up to a sync,
       * which costs a refused request and a toast — where being *silent* about
       * it would cost a double booking.
       *
       * Note this ignores `visible`: someone who has hidden their classes but
       * asked you to book for them still has to be told what they are booked
       * onto, or the offer is unusable.
       */
      bookedFor: buddies.flatMap(buddy => {
        const booking = buddy.bookings.find(held => held.classEventId === entry.id)
        return booking
          ? [{ contactId: buddy.contactId, name: buddy.name, state: booking.state }]
          : []
      }),
    }
  })

  const going = await alsoGoing(entries.map(entry => entry.id), member.contactId)
  for (const entry of entries) entry.going = going[entry.id] ?? []

  return {
    date: from,
    now,
    club: entries.find(entry => entry.club)?.club ?? null,
    /** Who this member may book in, alongside themselves. */
    bookFor: buddies.map(({ contactId, name }) => ({ contactId, name })),
    entries,
  }
})
