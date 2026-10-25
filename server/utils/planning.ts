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

import { BOOKING_DAYS_AHEAD } from '#shared/booking'
import { addDays, today } from '#shared/naive'
import type { ClassEvent, Client, Directory } from './gladstone'
import { siteIdOf } from './gladstone'
import type { Member } from './store'

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
  from: string,
  to: string,
): Promise<ClassEvent[]> {
  // Keyed by member: Gladstone personalises the timetable — each session
  // carries the viewer's own booking state — so a grid cached under one
  // member must never be served to another, or it would show them somebody
  // else's bookings. (Resamania's grid was identical for everyone, and this
  // key was just the club.) Not keyed by site: the response holds every site,
  // and two members who chose different ones still want the same bytes.
  return cached(`planning:${client.profile.contactId}:${from}:${to}`, PLANNING_TTL_MS, () =>
    client.planning(from, to))
}

/** A KAL centre that runs classes. */
export interface Site {
  /** Bare site id, e.g. `CVLC`. */
  id: string
  name: string
}

/**
 * Every site with classes on over the booking window.
 *
 * Gladstone has no list of sites that a member can read, so this is drawn
 * from the timetable itself. A centre with nothing on that week is missing,
 * which is the right answer for a list of places you might go to a class.
 * Cached like the directory, and not per member: which centres exist is the
 * same for everybody.
 */
export function getSites(client: Client): Promise<Site[]> {
  return cached('sites', DIRECTORY_TTL_MS, async () => {
    const from = today()
    const events = await getPlanning(client, from, addDays(from, BOOKING_DAYS_AHEAD + 1))

    const sites = new Map<string, string>()
    for (const event of events) {
      if (event.siteId) sites.set(event.siteId, event.siteName ?? event.siteId)
    }

    return [...sites].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  })
}

/**
 * Which sites a member wants on their timetable.
 *
 * Their own choice when they have made one, otherwise their home centre — the
 * one the club has on file for them, and the only one this app showed before
 * there was a choice. Empty means every site, which is what a member with no
 * home on file gets rather than an empty timetable.
 */
export function sitesFor(member: Pick<Member, 'sites' | 'clubId'>): string[] {
  if (member.sites.length) return member.sites
  const home = siteIdOf(member.clubId)
  return home ? [home] : []
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
