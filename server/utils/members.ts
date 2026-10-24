/**
 * Members of this app, and what they share with each other.
 *
 * KAL has no concept of following another member, and the obvious workaround
 * — storing a friend's *login* and signing in as them, which is what the
 * BigBox desktop app this began as did — is a bad one. Instead: everyone signs into this app themselves, their own
 * bookings and gym visits are snapshotted here, and the shared view is
 * assembled from those snapshots. Nobody ever holds anybody else's credentials.
 */

import { naiveNow, naiveTime, parseNaive, today } from '#shared/naive'
import type { Notice } from '#shared/notices'
import { currentNotices, withNotice } from '#shared/notices'
import { BOOKED, QUEUED, detectOpenings, detectPromotions, hasOpening } from '#shared/promotions'
import type { Visit } from '#shared/visits'
import { toVisits, weekdayOf } from '#shared/visits'
import { decrypt, encrypt } from './crypto'
import { getDirectory, invalidatePlanning } from './planning'
import type { Attendee } from './gladstone'
import {
  Client,
  activityName,
  classActivityId,
  classEnd,
  classStart,
  coachName,
  isActive,
  isQueued,
  placesRemaining,
  studioName,
} from './gladstone'
import {
  type Attended,
  type Member,
  type StoredBooking,
  readMember,
  readMembers,
  writeMember,
} from './store'

/**
 * How much visit history to keep per member.
 *
 * A week is what makes "usually here on Tuesday evenings" answerable while
 * staying a rolling window rather than a permanent record of somebody's
 * comings and goings. Anything older is dropped on every sync.
 */
export const ENTRY_RETENTION_DAYS = 7

/**
 * How often to rebuild the attendance history.
 *
 * Rebuilding walks a member's entire booking history, which the API returns
 * over many pages for anyone who has been a member a while. The answer only
 * changes when a booked class passes, so once a day is plenty and doing it on
 * every two-minute sync would be rude to the club's API for nothing.
 */
const ATTENDED_REFRESH_MS = 24 * 60 * 60_000

// --- Live API clients ---

interface CachedClient {
  client: Client
  at: number
}

/**
 * Signed-in Gladstone clients, keyed by contact IRI.
 *
 * A client is worth reusing: logging in costs two round trips (the login check
 * and the profile) and the club's API is not ours to hammer. Gladstone has no
 * token to expire, so a client would work forever — they are dropped after a
 * while anyway so a member who changes their KAL password finds out from a
 * failed sync rather than being served indefinitely from an old one.
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
 * Signs a member in against KAL and records them here.
 *
 * There is no separate sign-up: a KAL membership *is* the account, so a
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
    bookableBy: current?.bookableBy ?? [],
    hiddenCategories: current?.hiddenCategories ?? [],
    hideFinished: current?.hideFinished ?? false,
    hideVirtual: current?.hideVirtual ?? false,
    autoAccept: current?.autoAccept ?? [],
    bookings: current?.bookings ?? [],
    entries: current?.entries ?? [],
    attended: current?.attended ?? {},
    attendedSyncedAt: current?.attendedSyncedAt ?? null,
    notes: current?.notes ?? {},
    // Signing in again must not silently reissue the calendar URL somebody
    // has already subscribed a phone to, nor re-register a device they turned
    // notifications off on.
    calendarToken: current?.calendarToken ?? null,
    pushSubscriptions: current?.pushSubscriptions ?? [],
    notices: current?.notices ?? [],
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
 * Refreshes this member's bookings and gym visits from KAL.
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
export async function syncMember(
  member: Member,
): Promise<{ bookings: number, entries: number, notices: Notice[] }> {
  const client = await clientFor(member)
  const from = today()

  const [attendees, entries, directory] = await Promise.all([
    client.bookingsFrom(from),
    // A member who has turned visit sharing off should not have their
    // movements collected in the first place, not merely hidden at render.
    member.shareEntries ? client.entries(member.contactId) : Promise.resolve([]),
    // Process-wide and cached for six hours, so this is free after the first
    // member of the run. It is what turns the IRIs on a booking into the names
    // the calendar feed and the promotion notice have to say out loud.
    getDirectory(client),
  ])

  const scans = entries.flatMap(entry => {
    const at = parseNaive(entry.createdAt)
    // A scan with no usable timestamp cannot be placed in a visit, and a visit
    // is the only thing these are ever used for.
    return at ? [{ id: entry['@id'], at, crossingPoint: entry.crossingPoint ?? '' }] : []
  })

  const bookings: StoredBooking[] = attendees.filter(isActive).flatMap(attendee => {
    const event = attendee.classEvent
    const start = event ? classStart(event) : null
    if (!event || !start) return []

    return [{
      classEventId: event['@id'],
      state: isQueued(attendee) ? QUEUED : BOOKED,
      startedAt: start,
      // Enough to describe the class without asking the club again — see
      // `StoredBooking`. The class embedded in a booking is the thin copy, but
      // it does carry the IRIs, which is all the directory needs.
      name: activityName(directory, event) ?? 'Class',
      endedAt: classEnd(event) ?? undefined,
      studio: studioName(directory, event),
      coach: coachName(directory, event),
      spaces: placesRemaining(event),
    }]
  })

  // Only when stale: this is the expensive call in the whole sync.
  const attended = staleAttendance(member)
    ? buildAttended(await client.myBookings(), naiveNow())
    : null

  const cutoff = cutoffDate()

  /**
   * Filled in inside the write, so the comparison is against what is actually
   * on disk rather than against the copy this function was handed — which by
   * now may be a sync or a booking out of date, and would re-announce a
   * promotion that was already announced.
   */
  let noticed: Notice[] = []

  const saved = await writeMember(member.contactId, current => {
    const base = current ?? member
    const at = naiveNow()

    const previous = base.bookings ?? []
    noticed = [
      ...detectPromotions(previous, bookings, at).map(promotion => ({ ...promotion, kind: 'promoted' as const })),
      ...detectOpenings(previous, bookings, at).map(opening => ({ ...opening, kind: 'space-available' as const })),
    ].map(notice => ({ ...notice, noticedAt: new Date().toISOString(), seen: false }))

    // A space somebody else took, or one this member has since booked or
    // walked away from, is no longer news — and "a space opened" left on the
    // banner would send them to a class that is full again.
    const open = new Set(bookings.filter(hasOpening).map(booking => booking.classEventId))
    const held = currentNotices(base.notices, at).filter(notice =>
      notice.kind !== 'space-available' || open.has(notice.classEventId))

    // Merge by entry IRI: the API's window overlaps what we already hold, and
    // re-adding the same scan every two minutes would multiply it.
    const merged = new Map((base.entries ?? []).map(entry => [entry.id, entry]))
    if (base.shareEntries) {
      for (const scan of scans) merged.set(scan.id, scan)
    }

    return {
      ...base,
      bookings,
      // A place the member is no longer waiting for has nothing to accept.
      autoAccept: (base.autoAccept ?? []).filter(id =>
        bookings.some(booking => booking.classEventId === id && booking.state === QUEUED)),
      attended: attended ?? base.attended,
      attendedSyncedAt: attended ? new Date().toISOString() : base.attendedSyncedAt,
      entries: base.shareEntries
        ? [...merged.values()].filter(entry => entry.at >= cutoff).sort((a, b) => a.at.localeCompare(b.at))
        : [],
      // Recorded here rather than by the caller: this write already holds the
      // comparison that produced them, and doing it in a second write would
      // leave a window where a promotion was detected and never stored.
      notices: noticed.reduce((kept, notice) => withNotice(kept, notice, at), held),
      syncError: null,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  return {
    bookings: saved.bookings.length,
    entries: saved.entries.length,
    notices: noticed,
  }
}

/**
 * Books a waiting-list place the member asked to have accepted for them.
 *
 * One attempt per opt-in, whatever happens. If the club takes the booking the
 * member is told they are in; if it refuses — somebody else got there first,
 * or Gladstone will not book a member off their own waiting list — the opt-in
 * is dropped and they are told the space exists, so they can go and try
 * themselves. Retrying on every sync instead would mean a refused booking
 * being re-sent to the club every two minutes for as long as the space stays
 * open.
 *
 * Returns the notice to send, already recorded. The snapshot is updated to the
 * seat in the same write, because otherwise the next sync would see queued
 * turn into booked and announce the promotion a second time.
 */
export async function claimSpace(member: Member, booking: StoredBooking): Promise<Notice> {
  let claimed = false

  try {
    const attendee = await (await clientFor(member)).book(booking.classEventId)
    claimed = !isQueued(attendee)
  } catch (error) {
    console.error(`[auto-accept] ${member.email}: could not book ${booking.classEventId}`, error)
  }

  const notice: Notice = {
    kind: claimed ? 'promoted' : 'space-available',
    classEventId: booking.classEventId,
    name: booking.name ?? 'your class',
    startedAt: booking.startedAt,
    noticedAt: new Date().toISOString(),
    seen: false,
  }

  await writeMember(member.contactId, current => ({
    ...current!,
    bookings: claimed
      ? current!.bookings.map(held =>
          held.classEventId === booking.classEventId ? { ...held, state: BOOKED } : held)
      : current!.bookings,
    autoAccept: current!.autoAccept.filter(id => id !== booking.classEventId),
    notices: withNotice(current!.notices, notice, naiveNow()),
    updatedAt: new Date().toISOString(),
  }))

  if (claimed) invalidatePlanning()
  return notice
}

/** Turns auto-accept on or off for one of the member's waiting-list places. */
export function setAutoAccept(contactId: string, classEventId: string, on: boolean): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    autoAccept: [
      ...current!.autoAccept.filter(id => id !== classEventId),
      ...(on ? [classEventId] : []),
    ],
    updatedAt: new Date().toISOString(),
  }))
}

/**
 * Records something done to a member's bookings by somebody else.
 *
 * The other way a notice arrives. Unlike a promotion there is nothing to
 * detect — the request that did it is right here — so this is a plain write,
 * and it is the *subject's* record that changes rather than the actor's.
 */
export function recordNotice(contactId: string, notice: Notice): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    notices: withNotice(current!.notices, notice, naiveNow()),
    updatedAt: new Date().toISOString(),
  }))
}

/**
 * Marks notices seen — one class's, or all of them.
 *
 * Per class because the banner shows one line per notice with its own dismiss:
 * clearing "Sam booked you into Body Pump" should not also clear "you are off
 * the waiting list for Reformer" sitting underneath it.
 */
export function markNoticesSeen(contactId: string, classEventId?: string): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    notices: current!.notices.map(notice =>
      !classEventId || notice.classEventId === classEventId
        ? { ...notice, seen: true }
        : notice),
    updatedAt: new Date().toISOString(),
  }))
}

function staleAttendance(member: Member): boolean {
  if (!member.attendedSyncedAt) return true
  return Date.now() - Date.parse(member.attendedSyncedAt) > ATTENDED_REFRESH_MS
}

/**
 * Which class types this member has actually been to, and how often.
 *
 * Three exclusions, each of which would otherwise inflate the count: a
 * cancelled booking is not an attendance, a waiting-list place that never got
 * promoted is not one either, and a class in the future has not happened yet.
 */
export function buildAttended(attendees: Attendee[], now: string): Record<string, Attended> {
  const attended: Record<string, Attended> = {}

  for (const attendee of attendees) {
    if (!isActive(attendee) || isQueued(attendee)) continue

    const event = attendee.classEvent
    const start = event ? classStart(event) : null
    if (!event || !start || start >= now) continue

    const activity = classActivityId(event)
    if (!activity) continue

    const existing = attended[activity]
    attended[activity] = {
      count: (existing?.count ?? 0) + 1,
      lastAt: existing && existing.lastAt > start ? existing.lastAt : start,
    }
  }

  return attended
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
  settings: Partial<
    Pick<Member, 'visible' | 'shareEntries' | 'bookableBy' | 'hiddenCategories' | 'hideFinished' | 'hideVirtual'>
  >,
): Promise<Member> {
  return writeMember(contactId, current => {
    const next = { ...current!, ...settings, updatedAt: new Date().toISOString() }
    // Turning visit sharing off discards what was already collected rather
    // than merely hiding it. "Off" should not mean "still on file".
    if (settings.shareEntries === false) next.entries = []
    return next
  })
}

// --- Booking for each other ---

/**
 * Somebody the viewer may book onto classes.
 *
 * Names only in the direction that matters: this is the list of people who
 * have granted the viewer something, never a list of people the viewer has
 * granted, which is a different question with a different answer.
 */
export interface BookingBuddy {
  contactId: string
  name: string
  /** Their last-synced bookings, so the UI can say what they already hold. */
  bookings: StoredBooking[]
}

/**
 * Whether `viewerContactId` may act on `member`'s bookings.
 *
 * Deliberately the only place the rule is written down, and deliberately not
 * satisfied by the member themselves — booking for yourself goes down the
 * ordinary path, and letting this return true for the viewer would mean a bug
 * in the grant list could not be told apart from booking your own class.
 */
export function mayBookFor(
  member: Pick<Member, 'contactId' | 'bookableBy'>,
  viewerContactId: string,
): boolean {
  return member.contactId !== viewerContactId
    && (member.bookableBy ?? []).includes(viewerContactId)
}

/**
 * Who, out of `members`, has let the viewer book for them.
 *
 * Visibility is not consulted: hiding your classes from the timetable and
 * asking someone to book them for you are separate choices, and a member who
 * has made both still needs their buddy to be able to act.
 */
export function buddiesFor(members: Member[], viewerContactId: string): BookingBuddy[] {
  return members
    .filter(member => mayBookFor(member, viewerContactId))
    .map(member => ({
      contactId: member.contactId,
      name: memberName(member),
      bookings: member.bookings,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The same, read from the store. */
export async function bookingBuddies(viewerContactId: string): Promise<BookingBuddy[]> {
  return buddiesFor(await readMembers(), viewerContactId)
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

/** Somebody whose gym visits suggest they are usually here at a given time. */
export interface AroundMember {
  contactId: string
  name: string
  /** Start of their usual window on this weekday, `19:11`. */
  arrived: string
  /** End of it, `20:16`. */
  left: string
  /** How many visits on this weekday this is drawn from. */
  seen: number
}

/**
 * Who tends to be at the club on the same weekday as `date`.
 *
 * Drawn from the same weekday in previous weeks, never from `date` itself —
 * "Sam is usually here about now" is a different claim from "Sam is here",
 * and only the first is one a week of history can support.
 *
 * Members whose visits recorded no departure are left out: without both ends
 * there is no window for a class time to fall inside, and inventing a
 * plausible length would be making the answer up.
 */
export async function regularsOn(
  date: string,
  viewerContactId: string,
): Promise<AroundMember[]> {
  const weekday = weekdayOf(date)
  const around: AroundMember[] = []

  for (const member of await readMembers()) {
    if (!member.visible || !member.shareEntries || member.contactId === viewerContactId) continue

    const sameWeekday = toVisits(member.entries).filter(visit =>
      visit.date !== date && weekdayOf(visit.date) === weekday && visit.left !== null)

    if (!sameWeekday.length) continue

    around.push({
      contactId: member.contactId,
      name: memberName(member),
      arrived: sameWeekday.reduce((a, b) => (a.arrived <= b.arrived ? a : b)).arrived,
      left: sameWeekday.reduce((a, b) => (a.left! >= b.left! ? a : b)).left!,
      seen: sameWeekday.length,
    })
  }

  return around.sort((a, b) => a.arrived.localeCompare(b.arrived))
}

/** Whether a class starting at `start` falls inside somebody's usual window. */
export function isAround(member: AroundMember, start: string): boolean {
  const at = naiveTime(start)
  return at >= member.arrived && at <= member.left
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
  /** Whether this member has let the viewer book them onto classes. */
  youCanBook: boolean
  /** Whether the viewer has let *them* do the same. */
  canBookYou: boolean
}

/** Every visible member, for the People page. */
export async function memberSummaries(viewerContactId: string): Promise<MemberSummary[]> {
  const floor = `${today()}T00:00:00`
  const members = await readMembers()
  const granted = new Set(
    members.find(member => member.contactId === viewerContactId)?.bookableBy ?? [])

  const summaries = members
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
        youCanBook: mayBookFor(member, viewerContactId),
        canBookYou: granted.has(member.contactId),
      }
    })

  return summaries.sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name))
}

/**
 * The people the viewer has let book for them, named.
 *
 * Unlike `memberSummaries` this does not filter on visibility: the viewer
 * granted these people themselves, so they already know who they are, and
 * dropping one who has since hidden their classes would leave a permission
 * that could be neither seen nor revoked.
 */
export async function whoCanBookYou(viewerContactId: string): Promise<{ contactId: string, name: string }[]> {
  const members = await readMembers()
  const granted = new Set(
    members.find(member => member.contactId === viewerContactId)?.bookableBy ?? [])

  return members
    .filter(member => granted.has(member.contactId))
    .map(member => ({ contactId: member.contactId, name: memberName(member) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type { Member }
