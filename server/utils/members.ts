/**
 * Members of this app, and the bookings they share with each other.
 *
 * BigBox has no concept of following another member, so the desktop app's
 * "friends" feature works by storing a friend's *login* and signing in as
 * them. This replaces that: everyone signs into this app themselves, their own
 * bookings are snapshotted here, and the shared view is assembled from those
 * snapshots. Nobody ever holds anybody else's credentials.
 */

import { and, desc, eq, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm'
import { bookings, users, type User } from '../database/schema'
import { decrypt, encrypt } from './crypto'
import { useDb } from './db'
import { today } from '#shared/naive'
import { Client, classStart, isActive, isQueued } from './resamania'

// --- Live API clients ---

interface CachedClient {
  client: Client
  at: number
}

/**
 * Signed-in Resamania clients, keyed by contact IRI.
 *
 * A client is worth reusing: logging in costs three round trips (token,
 * contact_user, contact) and the club's API is not ours to hammer. Clients
 * refresh their own tokens, so one stays usable well past the hour an access
 * token lasts, but they are dropped after a while anyway so a member who
 * changes their BigBox password is not served indefinitely from a stale
 * session.
 */
const CLIENT_TTL_MS = 30 * 60_000
const clients = new Map<string, CachedClient>()

declare global {
   
  var __bigbudsClients: Map<string, CachedClient> | undefined
}

const clientCache = (globalThis.__bigbudsClients ??= clients)

/** A signed-in client for this member, reusing a live session where possible. */
export async function clientFor(user: Pick<User, 'contactId' | 'email' | 'encryptedPassword'>) {
  const cached = clientCache.get(user.contactId)
  if (cached && Date.now() - cached.at < CLIENT_TTL_MS) return cached.client

  const client = await Client.login(user.email, decrypt(user.encryptedPassword))
  clientCache.set(user.contactId, { client, at: Date.now() })
  return client
}

export function forgetClient(contactId: string) {
  clientCache.delete(contactId)
}

// --- Registration ---

/**
 * Signs a member in against BigBox and records them here.
 *
 * There is no separate sign-up: a BigBox membership *is* the account, so a
 * first login creates the row and every later one refreshes it. The password
 * is re-encrypted each time so that changing it at the club and signing in
 * here is all it takes to fix a broken background sync.
 */
export async function signIn(email: string, password: string): Promise<User> {
  const client = await Client.login(email.trim(), password)
  const profile = client.profile

  const db = useDb()
  const values = {
    contactId: profile.contactId,
    clubId: profile.clubId,
    email: profile.email || email.trim(),
    givenName: profile.givenName,
    familyName: profile.familyName,
    membershipNumber: profile.number,
    encryptedPassword: encrypt(password),
    syncError: null,
    updatedAt: new Date(),
  }

  const [user] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: users.contactId, set: values })
    .returning()

  if (!user) throw new Error('Failed to record member')

  clientCache.set(profile.contactId, { client, at: Date.now() })
  return user
}

export function findUser(id: number) {
  return useDb().query.users.findFirst({ where: eq(users.id, id) })
}

// --- Booking snapshots ---

/**
 * Refreshes this member's stored bookings from BigBox.
 *
 * The snapshot is deliberately *replaced* rather than merged: a booking the
 * member cancelled in the club's own app has no row to update here, it simply
 * stops being returned, and merging would leave it showing to everyone else
 * forever. Anything not in the fresh list, plus anything already in the past,
 * is deleted.
 */
export async function syncBookings(user: User): Promise<number> {
  const client = await clientFor(user)
  const from = today()

  const attendees = await client.bookingsFrom(from)

  const rows = attendees
    .filter(attendee => isActive(attendee))
    .flatMap(attendee => {
      const event = attendee.classEvent
      const start = event ? classStart(event) : null
      if (!event || !start) return []

      return [{
        userId: user.id,
        classEventId: event['@id'],
        state: isQueued(attendee) ? 'queued' : 'booked',
        startedAt: start,
        syncedAt: new Date(),
      }]
    })

  const db = useDb()

  await db.transaction(async tx => {
    if (rows.length) {
      await tx
        .insert(bookings)
        .values(rows)
        .onConflictDoUpdate({
          target: [bookings.userId, bookings.classEventId],
          set: {
            state: sql`excluded.state`,
            startedAt: sql`excluded.started_at`,
            syncedAt: new Date(),
          },
        })
    }

    // Drop this member's rows that BigBox no longer returns, which is what a
    // cancellation looks like from here.
    const stale = rows.length
      ? and(
          eq(bookings.userId, user.id),
          notInArray(bookings.classEventId, rows.map(row => row.classEventId)),
        )
      : eq(bookings.userId, user.id)

    await tx.delete(bookings).where(stale)

    // Then prune everyone's finished classes. Global rather than per-member on
    // purpose: this is the only thing that runs often enough to keep the table
    // proportional to what is upcoming instead of growing forever, and a
    // member who stops using the app would otherwise leave rows behind.
    await tx.delete(bookings).where(lt(bookings.startedAt, `${from}T00:00:00`))
  })

  await db
    .update(users)
    .set({ lastSyncedAt: new Date(), syncError: null })
    .where(eq(users.id, user.id))

  return rows.length
}

// --- The shared view ---

export interface AlsoGoing {
  contactId: string
  name: string
  /** `booked` or `queued` — a waiting-list place is not a promise to be there. */
  state: string
}

/**
 * Who else is going, for a set of classes.
 *
 * Returns a map from class IRI to the members going, excluding the viewer
 * themselves (they already know) and anyone who has turned visibility off.
 */
export async function alsoGoing(
  classEventIds: string[],
  viewerContactId: string,
): Promise<Record<string, AlsoGoing[]>> {
  if (!classEventIds.length) return {}

  const rows = await useDb()
    .select({
      classEventId: bookings.classEventId,
      state: bookings.state,
      contactId: users.contactId,
      givenName: users.givenName,
      familyName: users.familyName,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(
        inArray(bookings.classEventId, classEventIds),
        eq(users.visible, true),
        ne(users.contactId, viewerContactId),
      ),
    )

  const going: Record<string, AlsoGoing[]> = {}
  for (const row of rows) {
    const name = `${row.givenName} ${row.familyName}`.trim() || 'A member'
    ;(going[row.classEventId] ??= []).push({
      contactId: row.contactId,
      name,
      state: row.state,
    })
  }

  // Seats before waiting-list places, then alphabetically, so the order a
  // member sees is stable between renders rather than however Postgres felt.
  for (const list of Object.values(going)) {
    list.sort((a, b) =>
      a.state === b.state ? a.name.localeCompare(b.name) : a.state === 'booked' ? -1 : 1,
    )
  }

  return going
}

/** Every member who has ever signed in, for the People page. */
export async function allMembers(viewerContactId: string) {
  const from = today()

  const rows = await useDb()
    .select({
      contactId: users.contactId,
      givenName: users.givenName,
      familyName: users.familyName,
      visible: users.visible,
      lastSyncedAt: users.lastSyncedAt,
      classEventId: bookings.classEventId,
      startedAt: bookings.startedAt,
      state: bookings.state,
    })
    .from(users)
    .leftJoin(
      bookings,
      and(eq(bookings.userId, users.id), gte(bookings.startedAt, `${from}T00:00:00`)),
    )
    .where(eq(users.visible, true))
    .orderBy(users.givenName, desc(bookings.startedAt))

  const members = new Map<
    string,
    { contactId: string, name: string, isYou: boolean, upcoming: number, next: string | null }
  >()

  for (const row of rows) {
    const existing = members.get(row.contactId) ?? {
      contactId: row.contactId,
      name: `${row.givenName} ${row.familyName}`.trim() || 'A member',
      isYou: row.contactId === viewerContactId,
      upcoming: 0,
      next: null as string | null,
    }

    if (row.startedAt && row.state === 'booked') {
      existing.upcoming += 1
      if (!existing.next || row.startedAt < existing.next) existing.next = row.startedAt
    }

    members.set(row.contactId, existing)
  }

  return [...members.values()].sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name))
}

