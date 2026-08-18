/**
 * Members of this app, and what they share with each other.
 *
 * BigBox has no concept of following another member, so the desktop app's
 * "friends" feature works by storing a friend's *login* and signing in as
 * them. This replaces that: everyone signs into this app themselves, their own
 * bookings and gym visits are snapshotted here, and the shared view is
 * assembled from those snapshots. Nobody ever holds anybody else's credentials.
 */

import { parseNaive, today } from '#shared/naive'
import type { Visit } from '#shared/visits'
import { toVisits } from '#shared/visits'
import { decrypt, encrypt } from './crypto'
import { Client, classStart, isActive, isQueued } from './resamania'
import { type Member, readMember, readMembers, writeMember } from './store'

/**
 * How much visit history to keep per member.
 *
 * A week is what makes "usually here on Tuesday evenings" answerable while
 * staying a rolling window rather than a permanent record of somebody's
 * comings and goings. Anything older is dropped on every sync.
 */
export const ENTRY_RETENTION_DAYS = 7

// --- Live API clients ---

interface CachedClient {
  client: Client
  at: number
}

/**
 * Signed-in Resamania clients, keyed by contact IRI.
 *
 * A client is worth reusing: logging in costs three round trips and the club's
 * API is not ours to hammer. Clients refresh their own tokens, so one stays
 * usable well past the hour an access token lasts, but they are dropped after
 * a while anyway so a member who changes their BigBox password is not served
 * indefinitely from a stale session.
 */
const CLIENT_TTL_MS = 30 * 60_000

declare global {
  var __bigbudsClients: Map<string, CachedClient> | undefined
}

const clientCache = (globalThis.__bigbudsClients ??= new Map<string, CachedClient>())

/** A signed-in client for this member, reusing a live session where possible. */
export async function clientFor(member: Pick<Member, 'contactId' | 'email' | 'encryptedPassword'>) {
  const cached = clientCache.get(member.contactId)
  if (cached && Date.now() - cached.at < CLIENT_TTL_MS) return cached.client

  const client = await Client.login(member.email, decrypt(member.encryptedPassword))
  clientCache.set(member.contactId, { client, at: Date.now() })
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
 * first login creates the record and every later one refreshes it. The
 * password is re-encrypted each time, so changing it at the club and signing
 * in here is all it takes to fix a broken background sync.
 */
export async function signIn(email: string, password: string): Promise<Member> {
  const client = await Client.login(email.trim(), password)
  const profile = client.profile
  const now = new Date().toISOString()

  const member = await writeMember(profile.contactId, current => ({
    // Settings a returning member has already chosen must survive a re-login.
    visible: current?.visible ?? true,
    shareEntries: current?.shareEntries ?? true,
    bookings: current?.bookings ?? [],
    entries: current?.entries ?? [],
    createdAt: current?.createdAt ?? now,

    contactId: profile.contactId,
    clubId: profile.clubId,
    email: profile.email || email.trim(),
    givenName: profile.givenName,
    familyName: profile.familyName,
    membershipNumber: profile.number,
    encryptedPassword: encrypt(password),
    syncError: null,
    lastSyncedAt: current?.lastSyncedAt ?? null,
    updatedAt: now,
  }))

  clientCache.set(profile.contactId, { client, at: Date.now() })
  return member
}

export const findMember = readMember

// --- Snapshots ---

/**
 * Refreshes this member's bookings and gym visits from BigBox.
 *
 * Both snapshots are *replaced* rather than merged. A booking the member
 * cancelled in the club's own app has no row to update here, it simply stops
 * being returned, and merging would leave it showing to everyone else forever.
 *
 * Visits are the exception in one direction: the API returns only a short
 * window of recent scans, so those are *accumulated* — anything already stored
 * and still inside the retention window is kept, and new scans are merged in.
 * That is what makes a week of history possible at all.
 */
export async function syncMember(member: Member): Promise<{ bookings: number, entries: number }> {
  const client = await clientFor(member)
  const from = today()

  const [attendees, entries] = await Promise.all([
    client.bookingsFrom(from),
    // A member who has turned visit sharing off should not have their
    // movements collected in the first place, not merely hidden at render.
    member.shareEntries ? client.entries(member.contactId) : Promise.resolve([]),
  ])

  const scans = entries.flatMap(entry => {
    const at = parseNaive(entry.createdAt)
    // A scan with no usable timestamp cannot be placed in a visit, and a visit
    // is the only thing these are ever used for.
    return at ? [{ id: entry['@id'], at, crossingPoint: entry.crossingPoint ?? '' }] : []
  })

  const bookings = attendees.filter(isActive).flatMap(attendee => {
    const event = attendee.classEvent
    const start = event ? classStart(event) : null
    if (!event || !start) return []

    return [{
      classEventId: event['@id'],
      state: isQueued(attendee) ? 'queued' : 'booked',
      startedAt: start,
    }]
  })

  const cutoff = cutoffDate()

  const saved = await writeMember(member.contactId, current => {
    const base = current ?? member

    // Merge by entry IRI: the API's window overlaps what we already hold, and
    // re-adding the same scan every fifteen minutes would multiply it.
    const merged = new Map((base.entries ?? []).map(entry => [entry.id, entry]))
    if (base.shareEntries) {
      for (const scan of scans) merged.set(scan.id, scan)
    }

    return {
      ...base,
      bookings,
      entries: base.shareEntries
        ? [...merged.values()].filter(entry => entry.at >= cutoff).sort((a, b) => a.at.localeCompare(b.at))
        : [],
      syncError: null,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  return { bookings: saved.bookings.length, entries: saved.entries.length }
}

/** The oldest visit timestamp worth keeping, as a naive wall-clock string. */
function cutoffDate(): string {
  const [year, month, day] = today().split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(year, month - 1, day))
  at.setUTCDate(at.getUTCDate() - ENTRY_RETENTION_DAYS)
  return `${at.toISOString().slice(0, 10)}T00:00:00`
}

/** Records that a member could not be synced, for the UI to surface. */
export async function recordSyncFailure(contactId: string, message: string) {
  forgetClient(contactId)
  await writeMember(contactId, current => ({
    ...current!,
    syncError: message,
    updatedAt: new Date().toISOString(),
  }))
}

/** Updates a member's sharing settings. */
export function updateSettings(
  contactId: string,
  settings: Partial<Pick<Member, 'visible' | 'shareEntries'>>,
): Promise<Member> {
  return writeMember(contactId, current => {
    const next = { ...current!, ...settings, updatedAt: new Date().toISOString() }
    // Turning visit sharing off discards what was already collected rather
    // than merely hiding it. "Off" should not mean "still on file".
    if (settings.shareEntries === false) next.entries = []
    return next
  })
}

// --- The shared view ---

export interface AlsoGoing {
  contactId: string
  name: string
  /** `booked` or `queued`. */
  state: string
}

export const memberName = (member: Member) =>
  `${member.givenName} ${member.familyName}`.trim() || 'A member'

/**
 * Who else is going, for a set of classes.
 *
 * Excludes the viewer — they already know — and anyone who has turned
 * visibility off.
 */
export async function alsoGoing(
  classEventIds: string[],
  viewerContactId: string,
): Promise<Record<string, AlsoGoing[]>> {
  if (!classEventIds.length) return {}

  const wanted = new Set(classEventIds)
  const going: Record<string, AlsoGoing[]> = {}

  for (const member of await readMembers()) {
    if (!member.visible || member.contactId === viewerContactId) continue

    for (const booking of member.bookings) {
      if (!wanted.has(booking.classEventId)) continue
      ;(going[booking.classEventId] ??= []).push({
        contactId: member.contactId,
        name: memberName(member),
        state: booking.state,
      })
    }
  }

  // Seats before waiting-list places, then alphabetically, so the order is
  // stable between renders.
  for (const list of Object.values(going)) {
    list.sort((a, b) =>
      a.state === b.state ? a.name.localeCompare(b.name) : a.state === 'booked' ? -1 : 1)
  }

  return going
}

export interface MemberSummary {
  contactId: string
  name: string
  isYou: boolean
  /** Count of upcoming booked classes. */
  upcoming: number
  /** Naive start of their next class, if any. */
  next: string | null
  /** Recent gym visits, newest first. Empty when they do not share them. */
  visits: Visit[]
}

/** Every visible member, for the People page. */
export async function memberSummaries(viewerContactId: string): Promise<MemberSummary[]> {
  const floor = `${today()}T00:00:00`

  const summaries = (await readMembers())
    .filter(member => member.visible)
    .map(member => {
      const upcoming = member.bookings
        .filter(booking => booking.state === 'booked' && booking.startedAt >= floor)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

      return {
        contactId: member.contactId,
        name: memberName(member),
        isYou: member.contactId === viewerContactId,
        upcoming: upcoming.length,
        next: upcoming[0]?.startedAt ?? null,
        visits: member.shareEntries ? toVisits(member.entries) : [],
      }
    })

  return summaries.sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name))
}

export { type Member, readMembers }
