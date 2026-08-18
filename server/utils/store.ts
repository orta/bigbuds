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
  return {
    ...member,
    visible: member.visible ?? true,
    shareEntries: member.shareEntries ?? true,
    bookings: member.bookings ?? [],
    entries: member.entries ?? [],
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
