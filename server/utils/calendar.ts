/**
 * A member's classes, as a calendar feed.
 *
 * Subscribed once and then polled forever by something with no session and no
 * way to get one, which decides nearly everything about how this works.
 *
 * **The URL is the credential.** There is no sign-in step a calendar client
 * could perform, so the token in the path is the whole of the authentication.
 * It is 32 random bytes, it is the only thing in the app that authenticates
 * without a cookie, and the only revocation a URL can have is being replaced —
 * so resetting issues a new one and breaks every subscription to the old.
 *
 * **It is served from the snapshot, not from BigBox.** Calendar clients poll
 * on their own schedule and there are several of them per member — a phone, a
 * laptop, whatever Google does. Signing in as the member to answer each one
 * would put the club's API behind a load nobody is watching. The snapshot is
 * refreshed every fifteen minutes anyway, which is well inside how fresh a
 * calendar needs to be.
 */

import { buildCalendar, type CalendarEvent } from '#shared/ics'
import { naiveNow } from '#shared/naive'
import { QUEUED } from '#shared/promotions'
import { randomBytes } from 'node:crypto'
import { memberName } from './members'
import type { Member } from './store'
import { writeMember } from './store'

/**
 * Issues a fresh feed token, replacing any existing one.
 *
 * There is no "get or create": the only two things a member ever wants are a
 * URL where they had none, and a *different* URL because the old one got out.
 * Both are this.
 */
export async function issueCalendarToken(contactId: string): Promise<string> {
  // base64url so it survives being a path segment, and 32 bytes because this
  // is a bearer credential that will sit in somebody's calendar settings for
  // years.
  const token = randomBytes(32).toString('base64url')

  await writeMember(contactId, current => ({
    ...current!,
    calendarToken: token,
    updatedAt: new Date().toISOString(),
  }))

  return token
}

/** Withdraws the feed. Existing subscriptions start returning 404. */
export function revokeCalendarToken(contactId: string): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    calendarToken: null,
    updatedAt: new Date().toISOString(),
  }))
}

/**
 * The member's upcoming classes as an iCalendar document.
 *
 * Past classes are left out rather than carried indefinitely. A calendar is a
 * record of what is coming; the club is the record of what happened, and a
 * feed that accumulated every class forever would grow without a bound anyone
 * had chosen.
 */
export function buildFeed(member: Member, now = naiveNow()): string {
  const events: CalendarEvent[] = member.bookings.flatMap(booking => {
    if (booking.startedAt < now) return []

    // Written before the snapshot carried names — see `StoredBooking`. An
    // event called "Class" is worse than no event, and this fixes itself on
    // the member's next sync.
    if (!booking.name || !booking.endedAt) return []

    const queued = booking.state === QUEUED

    return [{
      // Stable across polls, so a client updates the event it already has
      // rather than adding a second copy of it every hour. Derived from the
      // class IRI, which is unique at the club and never reused.
      uid: `${booking.classEventId.replace(/\W+/g, '-').replace(/^-|-$/g, '')}@bigbuds`,
      start: booking.startedAt,
      end: booking.endedAt,
      // The prefix rather than only `STATUS:TENTATIVE`, because a phone's lock
      // screen shows the title and nothing else, and "you are ninth in the
      // queue" is not something to find out by turning up.
      summary: queued ? `Waiting list · ${booking.name}` : booking.name,
      location: booking.studio ?? undefined,
      description: [
        booking.coach ? `With ${booking.coach}` : null,
        queued ? 'You are on the waiting list — the club promotes automatically.' : null,
      ].filter(Boolean).join('\n') || undefined,
      tentative: queued,
    }]
  })

  // Naive starts sort lexicographically, see `shared/naive.ts`.
  events.sort((a, b) => a.start.localeCompare(b.start))

  return buildCalendar({ name: `BigBox — ${memberName(member)}`, events })
}
