/**
 * Noticing that a waiting-list place became a real one.
 *
 * The club promotes automatically when somebody cancels, and tells nobody. So
 * the one thing a member most wants to be told — *you are in* — is the one
 * thing they can only find out by opening an app and looking, which for a
 * 06:30 class means looking the night before and hoping.
 *
 * KAL Pal is already signing in as every member every two minutes to keep
 * the shared timetable current, and already computing each booking's state to
 * store it. This is the diff between one of those snapshots and the next.
 *
 * Kept here, and pure, because the interesting part is which transitions count
 * and which are somebody doing something ordinary — and that is a thing to
 * pin down in tests rather than to reason about once while writing a sync.
 */

import type { Naive } from './naive'

/** The shape this needs out of a stored booking. */
export interface BookingSnapshot {
  classEventId: string
  /** `booked` or `queued`. */
  state: string
  startedAt: string
  /** Only present on snapshots written since the calendar feed was added. */
  name?: string
  /** Free places at the class when this was taken; absent on older snapshots. */
  spaces?: number | null
}

export interface Promotion {
  classEventId: string
  name: string
  startedAt: string
}

export const QUEUED = 'queued'
export const BOOKED = 'booked'

/**
 * Which of `next`'s bookings are places the member was previously waiting for.
 *
 * Three transitions look similar and only one of them is news:
 *
 * - **queued → booked** is a promotion, and the point of this function.
 * - **absent → booked** is the member booking a class. They pressed the button;
 *   they know.
 * - **absent → queued** is them joining a waiting list, likewise.
 *
 * A class that has already started is left out. The sync fetches from the
 * club's midnight, so a 07:00 run still sees this morning's 06:30 — and being
 * told at 07:00 that a place opened up at 06:25 is worse than being told
 * nothing, because it reads as an instruction to go somewhere that is over.
 *
 * One case this deliberately cannot tell apart: a member who leaves a waiting
 * list and books a seat outright between two syncs looks exactly like a
 * promotion from here, because in the snapshot it *is* queued-then-booked.
 * Distinguishing them would mean recording every action the app takes and
 * every one it does not — the club's own app can do this too — to suppress a
 * message whose worst case is telling somebody something they already knew.
 */
export function detectPromotions(
  previous: BookingSnapshot[],
  next: BookingSnapshot[],
  now: Naive,
): Promotion[] {
  const before = new Map(previous.map(booking => [booking.classEventId, booking]))

  return next.flatMap(booking => {
    if (booking.state !== BOOKED) return []
    if (before.get(booking.classEventId)?.state !== QUEUED) return []
    // Naive strings compare lexicographically, see `shared/naive.ts`.
    if (booking.startedAt < now) return []

    return [{
      classEventId: booking.classEventId,
      // A snapshot written before names were stored still promotes correctly;
      // it just cannot say which class until the next sync fills it in.
      name: booking.name ?? 'your class',
      startedAt: booking.startedAt,
    }]
  })
}

/**
 * Which of `next`'s waiting-list places now have a free space at the class.
 *
 * KAL does not promote off its waiting lists. When somebody cancels, it emails
 * *everybody* on the list that a space has come up and gives it to whoever
 * books first — so the news a waiting member wants is not "you are in" but
 * "go now", and it is only worth anything if it arrives before the email has
 * been read by the rest of the queue.
 *
 * Only the edge counts: queued with no free places, then queued with some. A
 * space that stays open across several syncs is announced once, and one that
 * closes and opens again is announced again, which is what the club's own
 * email does.
 *
 * A snapshot written before `spaces` was stored is treated as unknown rather
 * than as full, so the first sync after this shipped does not announce every
 * open class anybody happens to be queued for.
 */
export function detectOpenings(
  previous: BookingSnapshot[],
  next: BookingSnapshot[],
  now: Naive,
): Promotion[] {
  const before = new Map(previous.map(booking => [booking.classEventId, booking]))

  return next.flatMap(booking => {
    if (!hasOpening(booking)) return []

    const earlier = before.get(booking.classEventId)
    if (earlier?.state !== QUEUED || earlier.spaces !== 0) return []
    if (booking.startedAt < now) return []

    return [{
      classEventId: booking.classEventId,
      name: booking.name ?? 'your class',
      startedAt: booking.startedAt,
    }]
  })
}

/** Whether a member is waiting for a class that has a free place right now. */
export const hasOpening = (booking: BookingSnapshot): boolean =>
  booking.state === QUEUED && (booking.spaces ?? 0) > 0
