/**
 * The Postgres connection.
 *
 * Railway injects `DATABASE_URL`; locally it comes from `.env`. The client is
 * created once per process and reused — Nitro reloads modules in dev, so the
 * instance is stashed on `globalThis` to stop a hot reload opening a new pool
 * every time a server file is touched.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'

declare global {
   
  var __bigbudsDb: ReturnType<typeof create> | undefined
}

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')

  const sql = postgres(url, {
    max: 10,
    // Railway's internal network terminates TLS at the proxy and the
    // certificate is not one node trusts by default.
    ssl: url.includes('sslmode=require') ? 'require' : undefined,
  })

  return drizzle(sql, { schema })
}

export function useDb() {
  return (globalThis.__bigbudsDb ??= create())
}

export { schema }
