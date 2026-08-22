/**
 * The scheduled refresh of everyone's bookings and visits.
 *
 * This is what stored credentials buy: a member who booked something in the
 * club's own app, and has not opened this one since, still shows up correctly
 * on everyone else's grid. It is also the only way a week of visit history
 * gets built, since the club's API only offers a short window of recent scans.
 */

import { addDays, naiveDate, today } from '#shared/naive'
import { whenLabel } from '#shared/format'
import { forgetClient, recordSyncFailure, syncMember } from './members'
import { notify } from './push'
import { readMember, readMembers } from './store'
import { ApiError } from './resamania'

export interface SyncReport {
  members: number
  synced: number
  failed: number
  /** Waiting-list places that turned into real ones during this run. */
  promoted: number
  errors: { email: string, message: string }[]
}

export async function syncAllMembers(): Promise<SyncReport> {
  const everyone = await readMembers()
  const report: SyncReport = {
    members: everyone.length,
    synced: 0,
    failed: 0,
    promoted: 0,
    errors: [],
  }

  const clubToday = today()
  const clubTomorrow = addDays(clubToday, 1)

  // Sequential on purpose. This is the club's API, not ours, and a handful of
  // members every quarter of an hour is not worth a burst of parallel logins.
  for (const member of everyone) {
    try {
      const { promotions } = await syncMember(member)
      report.synced += 1
      report.promoted += promotions.length

      /**
       * The only notification this app sends, and only from here.
       *
       * `syncMember` also runs on sign-in and straight after a booking, and a
       * promotion detected on either of those paths is one the member is
       * already looking at — the page they are on is about to show it. This is
       * the path where nobody is looking, which is the whole reason to
       * interrupt them.
       *
       * Re-read rather than reusing the record from the top of the loop: a run
       * over every member takes a while, and a device that subscribed during
       * it should still be told.
       */
      for (const promotion of promotions) {
        const fresh = await readMember(member.contactId)
        if (!fresh) continue

        await notify(fresh, {
          title: `You are in — ${promotion.name}`,
          body: `A place came up for ${whenLabel(promotion.startedAt, clubToday, clubTomorrow)}.`,
          // One per class: two syncs noticing the same promotion replace each
          // other on the lock screen rather than stacking.
          tag: `promotion:${promotion.classEventId}`,
          url: `/bookings#${naiveDate(promotion.startedAt)}`,
        })
      }
    } catch (error) {
      report.failed += 1

      const message
        = error instanceof ApiError && error.kind === 'invalid_credentials'
          ? 'BigBox rejected the stored password — sign in again to reconnect.'
          : error instanceof Error
            ? error.message
            : String(error)

      report.errors.push({ email: member.email, message })

      // A stored password that no longer works will not start working, so drop
      // the cached client and record why, for the UI to surface.
      forgetClient(member.contactId)
      await recordSyncFailure(member.contactId, message)
    }
  }

  return report
}
