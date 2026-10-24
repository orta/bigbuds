/**
 * Telling a member something happened to their bookings.
 *
 * Two callers, arriving from opposite directions:
 *
 * - The scheduled sync, which *detected* a waiting-list promotion by diffing
 *   snapshots and has already recorded it inside the write that found it.
 * - The book and cancel endpoints, where somebody has just acted on another
 *   member's behalf. There is nothing to detect — the request that did it is
 *   right there — so the notice is recorded here and then sent.
 *
 * Both end in the same place, which is the point of the file: the wording of
 * each kind lives once, in `#shared/notices`, rather than being written out at
 * whichever call site happened to need it first.
 */

import { whenLabel } from '#shared/format'
import { addDays, naiveDate, today } from '#shared/naive'
import type { Notice } from '#shared/notices'
import { noticeSentence } from '#shared/notices'
import { recordNotice } from './members'
import { notify } from './push'
import type { Member } from './store'
import { readMember } from './store'

/** Turns a notice into something a lock screen can show. */
function payload(notice: Notice) {
  const clubToday = today()
  const { title, body } = noticeSentence(
    notice,
    whenLabel(notice.startedAt, clubToday, addDays(clubToday, 1)),
  )

  return {
    title,
    body,
    /**
     * Keyed on the class *and* the kind. Two syncs noticing the same promotion
     * replace each other rather than stacking — but somebody booking a member
     * in and then cancelling should not have the second message quietly
     * overwrite the first with no trace, because the member needs to know both
     * things happened to them.
     */
    tag: `${notice.kind}:${notice.classEventId}`,
    // A space is claimed from the timetable, not from the list of classes the
    // member already holds.
    url: notice.kind === 'space-available'
      ? `/?date=${naiveDate(notice.startedAt)}`
      : `/bookings#${naiveDate(notice.startedAt)}`,
  }
}

/**
 * Sends a notice that has already been recorded.
 *
 * Used by the scheduled sync, which stores promotions inside the same write
 * that detects them.
 */
export async function deliver(member: Member, notice: Notice): Promise<void> {
  await notify(member, payload(notice))
}

/**
 * Records a notice against the subject and then sends it.
 *
 * Never throws, and that is deliberate: the caller has already booked or
 * cancelled a class at the club. Failing their request because a push service
 * was slow would report a booking as failed that actually happened, which is
 * how somebody ends up booking it twice.
 *
 * Re-read rather than trusting the caller's copy of the subject, because the
 * write this performs is what produces the record to send from — and the
 * caller's copy predates it.
 */
export async function announce(contactId: string, notice: Notice): Promise<void> {
  try {
    await recordNotice(contactId, notice)

    const member = await readMember(contactId)
    if (member) await deliver(member, notice)
  } catch (error) {
    console.error('[notices] could not announce', notice.kind, error)
  }
}
