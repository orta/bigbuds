/**
 * Things that happened to a member's bookings without them doing it.
 *
 * This began as waiting-list promotions alone, which is the club acting on a
 * booking while nobody is watching. Being booked in by somebody you have given
 * that right to is the same shape of news — a class in your name that you did
 * not put there — and it wants the same two channels for the same reason: a
 * push notification if the member has them on, and a record that survives
 * until they have actually looked if they have not.
 *
 * The kinds are deliberately a closed list rather than a free-text message.
 * Every one of these interrupts somebody, so adding one should mean writing
 * the sentence here and thinking about whether it earns the interruption.
 */

import type { Naive } from './naive'

export type NoticeKind
  /** The club moved them off a waiting list and onto the class. */
  = 'promoted'
  /** Somebody they allowed booked them onto a class. */
  | 'booked-for-you'
  /** …or took them off one. */
  | 'cancelled-for-you'

export interface Notice {
  kind: NoticeKind
  classEventId: string
  /** The class's name at the time, so the record reads on its own later. */
  name: string
  /** Naive start of the class. */
  startedAt: Naive
  /**
   * Who did it. Absent for `promoted`, which nobody did — the club's
   * automation is not a person and saying "the club" would suggest somebody
   * there made a decision about this member.
   */
  by?: string
  /** ISO instant it was noticed, which is not when it happened. */
  noticedAt: string
  /** Cleared once the member has seen it in the app. */
  seen: boolean
}

/**
 * Adds a notice, keeping at most one per class.
 *
 * Newest wins, and that is the point rather than a tidiness measure. Somebody
 * booking a member in and then thinking better of it two minutes later would
 * otherwise leave both sentences on screen at once — "Sam booked you into Body
 * Pump" directly above "Sam cancelled Body Pump for you" — which is a banner
 * arguing with itself about whether the member has a class.
 */
export function withNotice(existing: Notice[], notice: Notice, now: Naive): Notice[] {
  return currentNotices(
    [...existing.filter(held => held.classEventId !== notice.classEventId), notice],
    now,
  )
}

/**
 * Drops notices whose class has been and gone.
 *
 * All of these are news about a class the member is about to go to, or now is
 * not, so they stop being anything once it starts — seen or not. That is also
 * what keeps the list from growing without a bound anybody chose, which
 * matters because it lives in a file that is read into memory whole.
 */
export function currentNotices(notices: Notice[], now: Naive): Notice[] {
  // Naive timestamps compare lexicographically, see `./naive.ts`.
  return notices
    .filter(notice => notice.startedAt >= now)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * Reads whatever a member's file has, from whichever version wrote it.
 *
 * Notices began as a `promotions` array holding only promotions. That shipped,
 * so there are records carrying it, and a member who was promoted before this
 * change should not lose the one notice the feature exists to give them.
 *
 * There are no migrations in this project — the store fills in fields as it
 * loads — so this is where that conversion has to live, and being a pure
 * function is what lets it be pinned rather than hoped about.
 */
export function noticesFrom(
  stored: { notices?: Notice[], promotions?: Omit<Notice, 'kind'>[] },
): Notice[] {
  if (stored.notices) return stored.notices

  return (stored.promotions ?? []).map(promotion => ({ ...promotion, kind: 'promoted' as const }))
}

/**
 * The one place each kind is put into words.
 *
 * `when` is pre-formatted by the caller — `whenLabel` needs the club's today
 * and tomorrow, and this file has no business working out what day it is.
 */
export function noticeSentence(notice: Notice, when: string): { title: string, body: string } {
  switch (notice.kind) {
    case 'promoted':
      return {
        title: `You are in — ${notice.name}`,
        body: `A place came up for ${when}.`,
      }
    case 'booked-for-you':
      return {
        title: `${notice.by} booked you in`,
        body: `${notice.name}, ${when}.`,
      }
    case 'cancelled-for-you':
      return {
        title: `${notice.by} cancelled a class for you`,
        body: `${notice.name}, ${when}.`,
      }
  }
}
