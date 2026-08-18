/**
 * Runs the sync on demand.
 *
 * The in-process scheduled task is the normal path; this exists so an external
 * scheduler — a Railway cron service, say — can drive it instead, and so the
 * sync can be triggered by hand while debugging.
 *
 * Guarded by a shared secret rather than a session: it is not a member action,
 * and it signs in as every member in the database.
 */

import { syncAllMembers } from '../utils/sync-all'

export default defineEventHandler(async event => {
  const expected = process.env.BIGBUDS_SYNC_TOKEN
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'Sync endpoint is not configured.' })
  }

  const provided = getRequestHeader(event, 'authorization')?.replace(/^Bearer /, '')
  if (provided !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return await syncAllMembers()
})
