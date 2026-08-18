/**
 * The scheduled refresh of everyone's bookings.
 *
 * This is what stored credentials buy: a member who booked something in the
 * club's own app, and has not opened this one since, still shows up correctly
 * on everyone else's grid.
 */

import { eq } from 'drizzle-orm'
import { users } from '../database/schema'
import { useDb } from './db'
import { forgetClient, syncBookings } from './members'
import { ApiError } from './resamania'

export interface SyncReport {
  members: number
  synced: number
  failed: number
  errors: { email: string, message: string }[]
}

export async function syncAllMembers(): Promise<SyncReport> {
  const db = useDb()
  const everyone = await db.select().from(users)

  const report: SyncReport = { members: everyone.length, synced: 0, failed: 0, errors: [] }

  // Sequential on purpose. This is the club's API, not ours, and a handful of
  // members every quarter of an hour is not worth a burst of parallel logins.
  for (const member of everyone) {
    try {
      await syncBookings(member)
      report.synced += 1
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
      await db.update(users).set({ syncError: message }).where(eq(users.id, member.id))
    }
  }

  return report
}
