/**
 * Cached reads of the club's timetable.
 *
 * The desktop app fetches this per person because there is only ever one
 * person. Here every member at the club is asking for the same bytes, so both
 * the directory and the planning grid are cached process-wide rather than
 * per-session.
 *
 * This is safe precisely because neither response is personalised: a class
 * event carries *everyone's* attendee records, and whether the viewer is
 * booked is worked out from those afterwards by `resolve`. Caching something
 * the API had personalised would show one member another's state.
 */

import type { ClassEvent, Client, Directory } from './gladstone'

interface Entry<T> {
  value: Promise<T>
  at: number
}

/**
 * Activities, coaches, studios and clubs. These change when the club changes
 * its timetable structure, i.e. rarely.
 */
const DIRECTORY_TTL_MS = 6 * 60 * 60_000

/**
 * The planning grid. Short, because the numbers that matter most on it —
 * places remaining, waiting-list length — move as people book.
 */
const PLANNING_TTL_MS = 45_000

declare global {
   
  var __bigbudsPlanningCache: Map<string, Entry<unknown>> | undefined
}

const cache = (globalThis.__bigbudsPlanningCache ??= new Map<string, Entry<unknown>>())

/**
 * Caches by key with a TTL, storing the *promise* rather than the resolved
 * value so that ten members loading the page at once produce one upstream
 * request rather than ten. A rejected promise is evicted, so a transient
 * failure is not cached.
 */
function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Entry<T> | undefined
  if (existing && Date.now() - existing.at < ttl) return existing.value

  const value = load().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, { value, at: Date.now() })
  return value
}

export function getDirectory(client: Client): Promise<Directory> {
  return cached('directory', DIRECTORY_TTL_MS, () => client.directory())
}

export function getPlanning(
  client: Client,
  clubId: string,
  from: string,
  to: string,
): Promise<ClassEvent[]> {
  // Keyed by member, not just by club: Gladstone personalises the timetable —
  // each session carries the viewer's own booking state — so a grid cached
  // under one member must never be served to another, or it would show them
  // somebody else's bookings. (Resamania's grid was identical for everyone,
  // and this key was just the club.)
  return cached(`planning:${client.profile.contactId}:${clubId}:${from}:${to}`, PLANNING_TTL_MS, () =>
    client.planning(clubId, from, to))
}

/**
 * One class event in full.
 *
 * The class records embedded in a booking are thinner than the planning grid's
 * — no capacity counters and no attendee lists — so anything that wants to say
 * how many people are waiting has to ask for the whole record. Cached on the
 * same short TTL, and shared between every member going to that class.
 */
export function getClassEvent(client: Client, id: string): Promise<ClassEvent> {
  // Per member for the same reason as `getPlanning`: a Gladstone session
  // carries the viewer's own booking state.
  return cached(`class_event:${client.profile.contactId}:${id}`, PLANNING_TTL_MS, () =>
    client.classEvent(id))
}

/**
 * Drops cached planning after a booking.
 *
 * Without this, a member books a class and the next page load serves them a
 * grid from up to `PLANNING_TTL_MS` ago that still says they are not booked —
 * which reads as the booking having failed.
 */
export function invalidatePlanning() {
  for (const key of cache.keys()) {
    // Individual class records go too: they carry the attendee lists the
    // member has just changed, so keeping them would show a stale queue.
    if (key.startsWith('planning:') || key.startsWith('class_event:')) cache.delete(key)
  }
}
