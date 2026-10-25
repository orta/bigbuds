/**
 * The member's own upcoming classes.
 *
 * Read live from KAL rather than from our snapshot: this is the page where
 * being wrong matters most, and the snapshot exists to serve *other* people.
 */

import { CATEGORIES, lookupClass } from '#shared/categories'
import { naiveNow, today } from '#shared/naive'
import type { ClassRow } from '#shared/types'
import { alsoGoing, clientFor } from '../utils/members'
import { noteCounts } from '../utils/notes'
import { getClassEvent, getDirectory, sitesFor } from '../utils/planning'
import { classStart, isActive, isCancellable, isQueued, resolve } from '../utils/gladstone'
import { requireMember } from '../utils/session'
import { readMembers } from '../utils/store'

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const client = await clientFor(member)

  const [directory, attendees, everyone] = await Promise.all([
    getDirectory(client),
    client.bookingsFrom(today()),
    readMembers(),
  ])

  const now = naiveNow()
  const notes = noteCounts(everyone)

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
        autoAccept: isQueued(attendee) && member.autoAccept.includes(entry.id),
        category: info.category,
        categoryLabel: CATEGORIES[info.category].label,
        tags: info.tags,
        // Everything here is upcoming by construction, filtered above.
        finished: false,
        attendedCount: entry.activityId ? (member.attended[entry.activityId]?.count ?? 0) : 0,
        attendedLast: entry.activityId ? (member.attended[entry.activityId]?.lastAt ?? null) : null,
        noteCount: entry.activityId ? (notes[entry.activityId] ?? 0) : 0,
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

  // Bookings come from every centre, so a member who only picked one can still
  // have a class elsewhere — one booked in the club's app, or by a buddy.
  const showSite = sitesFor(member).length !== 1
    || new Set(entries.map(entry => entry.club)).size > 1

  return { now, entries, showSite }
})
