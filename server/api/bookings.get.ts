/**
 * The member's own upcoming classes.
 *
 * Read live from BigBox rather than from our snapshot: this is the page where
 * being wrong matters most, and the snapshot exists to serve *other* people.
 */

import { CATEGORIES, lookupClass } from '#shared/categories'
import { naiveNow, today } from '#shared/naive'
import type { ClassRow } from '#shared/types'
import { alsoGoing, clientFor } from '../utils/members'
import { getClassEvent, getDirectory } from '../utils/planning'
import { classStart, isActive, isCancellable, isQueued, resolve } from '../utils/resamania'
import { requireMember } from '../utils/session'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const client = await clientFor(member)

  const [directory, attendees] = await Promise.all([
    getDirectory(client),
    client.bookingsFrom(today()),
  ])

  const now = naiveNow()

  const upcoming = attendees.filter(isActive).flatMap(attendee => {
    const embedded = attendee.classEvent
    const start = embedded ? classStart(embedded) : null

    // The server's date filter is whole-day inclusive, so classes earlier
    // today come back too. They are genuinely over, so drop them here.
    if (!embedded || !start || start < now) return []

    return [{ attendee, embedded }]
  })

  const entries: ClassRow[] = await Promise.all(
    upcoming.map(async ({ attendee, embedded }) => {
      // The copy embedded in a booking has no attendee lists and no capacity
      // counters, so the queue behind this booking is invisible from it. Fall
      // back to the thin copy if the full fetch fails — a row missing its
      // queue count is much better than a page that will not load.
      const classEvent = await getClassEvent(client, embedded['@id']).catch(() => embedded)

      const entry = resolve(directory, classEvent, member.contactId)
      const info = lookupClass(entry.name)

      return {
        ...entry,
        // `resolve` works these out from the class's attendee lists; the
        // booking itself is the more direct authority for the member's own
        // state, and carries the cancellation deadline besides.
        attendeeId: attendee['@id'],
        queued: isQueued(attendee),
        booked: !isQueued(attendee),
        cancellable: isCancellable(attendee),
        category: info.category,
        categoryLabel: CATEGORIES[info.category].label,
        tags: info.tags,
        // Everything here is upcoming by construction, filtered above.
        finished: false,
        attendedCount: entry.activityId ? (member.attended[entry.activityId]?.count ?? 0) : 0,
        attendedLast: entry.activityId ? (member.attended[entry.activityId]?.lastAt ?? null) : null,
        going: [],
        // Booking for other people happens on the timetable, where the whole
        // day is in front of you; this page is your own classes.
        bookedFor: [],
        // "Usually around" is a browsing aid for the timetable; on a class you
        // are already booked onto it answers a question nobody is asking.
        around: [],
      }
    }),
  )

  const going = await alsoGoing(entries.map(entry => entry.id), member.contactId)
  for (const entry of entries) entry.going = going[entry.id] ?? []

  return { now, entries }
})
