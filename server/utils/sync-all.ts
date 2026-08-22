/**
 * The scheduled refresh of everyone's bookings and visits.
 *
 * This is what stored credentials buy: a member who booked something in the
 * club's own app, and has not opened this one since, still shows up correctly
 * on everyone else's grid. It is also the only way a week of visit history
 * gets built, since the club's API only offers a short window of recent scans.
 */

import { forgetClient, recordSyncFailure, syncMember } from './members'
import { deliver } from './notices'
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

  // Sequential on purpose. This is the club's API, not ours, and a handful of
  // members every quarter of an hour is not worth a burst of parallel logins.
  for (const member of everyone) {
    try {
      const { notices } = await syncMember(member)
      report.synced += 1
      report.promoted += notices.length

      /**
       * Promotions are announced from here and nowhere else.
       *
       * `syncMember` also runs on sign-in and straight after a booking, and it
       * records what it finds on every one of those paths — but a promotion
       * detected while the member is signing in is one they are about to see
       * on the page they are opening. This is the path where nobody is
       * looking, which is the whole reason to interrupt them.
       *
       * The other kinds of notice do not come through here at all: being
       * booked in by somebody is announced by the endpoint that did it, which
       * has no diffing to do.
       *
       * Re-read rather than reusing the record from the top of the loop: a run
       * over every member takes a while, and a device that subscribed during
       * it should still be told.
       */
      for (const notice of notices) {
        const fresh = await readMember(member.contactId)
        if (!fresh) continue

        await deliver(fresh, notice)
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
