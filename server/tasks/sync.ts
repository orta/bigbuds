/**
 * Refreshes every member's bookings on a schedule. Wired up in `nuxt.config.ts`.
 */

import { syncAllMembers } from '../utils/sync-all'

export default defineTask({
  meta: {
    name: 'sync',
    description: "Refresh every member's bookings from BigBox",
  },
  async run() {
    const report = await syncAllMembers()
    console.log(
      `[sync] ${report.synced}/${report.members} members synced, ${report.failed} failed`
      + (report.promoted ? `, ${report.promoted} promoted off waiting lists` : ''),
    )
    return { result: report }
  },
})
