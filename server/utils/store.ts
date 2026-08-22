/**
 * The app's store: one JSON file per member, on a mounted disk.
 *
 * This used to be Postgres, which was more machinery than the data justifies.
 * There is no querying to speak of — every read is "all members" or "one
 * member by id" — the whole set is a few dozen records at a gym's scale, and a
 * mounted volume costs less than a database.
 *
 * Three things make that safe rather than merely cheap:
 *
 * - **Writes are atomic.** Each save writes a temporary file and renames it
 *   over the target, and POSIX rename is atomic — so a crash or a redeploy
 *   mid-write leaves either the old file or the new one, never a half-written
 *   one that fails to parse on the way back up.
 * - **Writes to one member are serialised** through a per-member promise
 *   chain. Two requests updating the same member — a booking sync and a
 *   settings change arriving together — would otherwise read the same state
 *   and the second would silently drop the first's change.
 * - **Everything is held in memory** after the first load. The set is small,
 *   the process is single-replica, and every write goes through here, so the
 *   map cannot drift from the disk.
 *
 * The trade this makes is that it does not survive being run on two machines
 * at once. `railway.json` pins one replica for that reason.
 */

import type { Notice } from '#shared/notices'
import { currentNotices, noticesFrom } from '#shared/notices'
import { naiveNow } from '#shared/naive'
import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** One class the member holds a place at. */
export interface StoredBooking {
  /** IRI, e.g. `/bigbox/class_events/1722803`. */
  classEventId: string
  /** `booked` or `queued` — a waiting-list place is not a promise to be there. */
  state: string
  /** Naive start, `2026-08-14T06:30:00`, in the club's wall clock. */
  startedAt: string

  /**
   * Enough of the class to describe it without asking BigBox again.
   *
   * The snapshot began as three fields, which is all the shared timetable
   * needs: it already has the club's own copy of every class in front of it
   * and only wants to know who is on which. The calendar feed has no such
   * copy — it is served to a calendar client with no session behind it, and
   * signing in as the member on every poll to turn ids into names would mean
   * hitting the club's API on somebody else's schedule.
   *
   * Optional because records written before this existed do not have them.
   * They fill in on that member's next sync, and the feed leaves out a
   * booking it cannot yet name rather than emitting `Class`.
   */
  name?: string
  /** Naive end, for the event's duration. */
  endedAt?: string
  studio?: string | null
  coach?: string | null
}

/** A member's own note about a class type. */
export interface StoredNote {
  /** Plain text, as typed. Trimmed and length-capped on the way in. */
  text: string
  /** ISO instant, so the reader can tell a note from last year. */
  updatedAt: string
}

/**
 * One browser or phone that has agreed to receive notifications.
 *
 * A member gets one of these per device rather than one each, because the
 * subscription is issued by the browser and a phone and a laptop are two
 * browsers. They expire on their own — a reinstalled app, a cleared site, a
 * push service retiring an endpoint — so sending prunes the dead ones rather
 * than expecting the member to tidy up.
 */
export interface StoredPushSubscription {
  endpoint: string
  /** The client's public key and auth secret, for RFC 8291 payload encryption. */
  keys: { p256dh: string, auth: string }
  createdAt: string
}

/**
 * Something that happened to this member's bookings without them doing it.
 *
 * Recorded as well as pushed, for two reasons. Push is best-effort — it needs
 * permission, it needs the app installed to the home screen on iOS, and the
 * message can simply not arrive — so a member who never turns it on would
 * otherwise get nothing at all from the news the app is best placed to give
 * them. And a notification is gone the moment it is swiped away, whereas this
 * survives until they have actually looked.
 *
 * The shape lives in `#shared/notices` because the browser renders these and
 * needs the same definition.
 */
export type StoredNotice = Notice

/**
 * A class type the member has been to before, keyed by activity IRI.
 *
 * Keyed by IRI rather than by name so a class the club renames does not look
 * like one you have never done.
 */
export interface Attended {
  /** How many times they have been. */
  count: number
  /** Naive start of the most recent one. */
  lastAt: string
}

/** One badge scan at a door. */
export interface StoredEntry {
  /** IRI, e.g. `/bigbox/entries/38364921`. */
  id: string
  /** Naive timestamp of the scan, in the club's wall clock. */
  at: string
  /** IRI of the door, e.g. `/bigbox/crossing_points/155`. */
  crossingPoint: string
}

export interface Member {
  /** IRI, e.g. `/bigbox/contacts/2327536`. The identity everything hangs off. */
  contactId: string
  clubId: string
  email: string
  givenName: string
  familyName: string
  /** Human-facing membership number, e.g. `C2327536`. */
  membershipNumber: string

  /** AES-256-GCM, see `./crypto.ts`. Never leaves the server. */
  encryptedPassword: string

  /** Whether this member's classes appear on other members' timetables. */
  visible: boolean
  /** Whether their gym hours appear. Separate from `visible` on purpose. */
  shareEntries: boolean

  /**
   * Contact IRIs of the members allowed to book this member onto classes, and
   * to undo it again.
   *
   * A list rather than a flag: "anyone signed into BigBuds may book me" is not
   * a thing anyone wants, whereas "my wife may book me" is, and the difference
   * is somebody else's Saturday morning. Empty by default, so the feature does
   * not exist for a member until they name a person.
   */
  bookableBy: string[]

  /**
   * Categories this member has hidden from their own timetable, by key.
   *
   * A display preference, not a privacy one — it changes what they see, never
   * what anyone else does.
   */
  hiddenCategories: string[]
  /** Whether to drop classes that have already started from the timetable. */
  hideFinished: boolean

  /**
   * The member's own notes, keyed by activity IRI.
   *
   * Keyed by class *type* rather than by class event, for the same reason
   * `attended` is: a note about Body Pump is a note about Body Pump, not about
   * one Tuesday's instance of it. Keying it to the event would mean writing
   * the same thing every week and losing all of it as each class passed.
   *
   * One note per member per class type. Editing replaces; there is no history,
   * because this is a note rather than a thread.
   */
  notes: Record<string, StoredNote>

  /**
   * The secret in this member's calendar feed URL, or null if they have never
   * asked for one.
   *
   * The URL is the whole credential — a calendar client subscribes once and
   * polls forever with no way to sign in — so it is a fresh 32 bytes rather
   * than anything derived from the member, and resetting it issues a new one
   * and breaks the old, which is the only revocation a URL can have.
   */
  calendarToken: string | null

  /** Devices that have agreed to receive notifications. Empty for most. */
  pushSubscriptions: StoredPushSubscription[]

  /** Things done to their bookings by the club or by somebody they allowed. */
  notices: StoredNotice[]

  /**
   * Set when the background sync could not sign in — almost always because
   * they changed their BigBox password. Surfaced as a prompt to sign in again
   * rather than failing silently.
   */
  syncError: string | null
  /** ISO instant of the last successful sync. */
  lastSyncedAt: string | null

  createdAt: string
  updatedAt: string

  bookings: StoredBooking[]
  entries: StoredEntry[]

  /** Class types they have been to, keyed by activity IRI. */
  attended: Record<string, Attended>
  /**
   * When the attendance history was last rebuilt.
   *
   * Rebuilding walks the member's entire booking history, which is many pages
   * for a long-standing member, so it runs daily rather than every sync — the
   * answer only changes when a class passes.
   */
  attendedSyncedAt: string | null
}

/** Where the JSON lives. Railway mounts a volume; locally it is `./.data`. */
function dataDir(): string {
  return process.env.BIGBUDS_DATA_DIR || join(process.cwd(), '.data')
}

const membersDir = () => join(dataDir(), 'members')

/**
 * A safe filename for a contact IRI.
 *
 * The IRI arrives from the API rather than from a user, but it ends up as a
 * path, so it is reduced to characters that cannot climb out of the directory
 * rather than trusted to be well-behaved.
 */
function fileFor(contactId: string): string {
  const slug = contactId.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) throw new Error(`Refusing to derive a filename from ${JSON.stringify(contactId)}`)
  return join(membersDir(), `${slug}.json`)
}

interface Store {
  members: Map<string, Member>
  loaded: boolean
  /** Per-member write chains, so concurrent updates queue instead of racing. */
  writes: Map<string, Promise<unknown>>
}

declare global {
  var __bigbudsStore: Store | undefined
}

const store: Store = (globalThis.__bigbudsStore ??= {
  members: new Map(),
  loaded: false,
  writes: new Map(),
})

/** Reads every member file into memory. Runs once per process. */
async function load(): Promise<void> {
  if (store.loaded) return

  await mkdir(membersDir(), { recursive: true })
  const files = (await readdir(membersDir())).filter(name => name.endsWith('.json'))

  for (const file of files) {
    const path = join(membersDir(), file)
    try {
      const member = JSON.parse(await readFile(path, 'utf8')) as Member
      store.members.set(member.contactId, withDefaults(member))
    } catch (error) {
      // One unreadable file must not take the whole app down: the member it
      // belongs to loses their session, everyone else carries on.
      console.error(`[store] Skipping unreadable member file ${file}:`, error)
    }
  }

  store.loaded = true
}

/**
 * Fills in fields added after a file was written.
 *
 * There are no migrations here, so anything added to `Member` later has to
 * have a sensible value for records that predate it.
 */
function withDefaults(member: Member): Member {
  /**
   * `promotions` is what `notices` was called before they had kinds.
   * `noticesFrom` reads it, and dropping it here is what stops a field nothing
   * refers to sitting in every member's file forever — and, worse, sitting
   * there as a second, stale copy of the notices somebody might later read.
   */
  const { promotions: _legacy, ...current } = member as Member & { promotions?: unknown }

  return {
    ...current,
    visible: member.visible ?? true,
    shareEntries: member.shareEntries ?? true,
    bookableBy: member.bookableBy ?? [],
    hiddenCategories: member.hiddenCategories ?? [],
    hideFinished: member.hideFinished ?? false,
    bookings: member.bookings ?? [],
    entries: member.entries ?? [],
    attended: member.attended ?? {},
    attendedSyncedAt: member.attendedSyncedAt ?? null,
    notes: member.notes ?? {},
    calendarToken: member.calendarToken ?? null,
    pushSubscriptions: member.pushSubscriptions ?? [],
    // Pruned on load as well as on write, so a process that has been up for a
    // week is not holding notices about classes that happened during it.
    notices: currentNotices(noticesFrom(member), naiveNow()),
    syncError: member.syncError ?? null,
    lastSyncedAt: member.lastSyncedAt ?? null,
  }
}

/** Writes one member to disk, atomically. */
async function persist(member: Member): Promise<void> {
  await mkdir(membersDir(), { recursive: true })

  const path = fileFor(member.contactId)
  const temporary = `${path}.tmp`

  await writeFile(temporary, `${JSON.stringify(member, null, 2)}\n`, 'utf8')
  // Atomic: readers see the old file or the new one, never a partial write.
  await rename(temporary, path)
}

/** Every member, in no particular order. */
export async function readMembers(): Promise<Member[]> {
  await load()
  return [...store.members.values()]
}

export async function readMember(contactId: string): Promise<Member | undefined> {
  await load()
  return store.members.get(contactId)
}

/**
 * The member whose calendar feed carries this token.
 *
 * A scan rather than an index: there is no second map to keep in step with the
 * first, and at a gym's scale the loop is over a few dozen strings. The
 * comparison is `timingSafeEqual` on equal-length buffers — the token is 32
 * random bytes and not realistically guessable a character at a time over a
 * network, but this is the one credential in the app that arrives in a URL,
 * and the safe comparison costs nothing.
 */
export async function readMemberByCalendarToken(token: string): Promise<Member | undefined> {
  await load()

  const offered = Buffer.from(token)

  for (const member of store.members.values()) {
    if (!member.calendarToken) continue
    const held = Buffer.from(member.calendarToken)
    if (held.length === offered.length && timingSafeEqual(held, offered)) return member
  }

  return undefined
}

/**
 * Read-modify-write one member, serialised against other writes to the same
 * member. `change` receives the current record, or `undefined` if this is the
 * first time we have seen them, and returns what to store.
 */
export function writeMember(
  contactId: string,
  change: (current: Member | undefined) => Member,
): Promise<Member> {
  const queued = (store.writes.get(contactId) ?? Promise.resolve()).then(async () => {
    await load()

    const next = withDefaults(change(store.members.get(contactId)))
    store.members.set(contactId, next)
    await persist(next)

    return next
  })

  // Keep the chain alive even if this link fails, so one bad write does not
  // wedge every later write for that member.
  store.writes.set(contactId, queued.catch(() => {}))

  return queued
}
