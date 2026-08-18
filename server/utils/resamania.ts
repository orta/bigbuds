/**
 * Client for the Resamania member API that backs BigBox Leisure Club.
 *
 * A port of the Rust client in `bigbox-for-cosmic`, and it keeps that client's
 * two load-bearing facts about this API:
 *
 * - **Entities reference each other by IRI**, not by id — a class names its
 *   activity as `"/bigbox/activities/2300"`. Turning those into display names
 *   needs the lookup tables in `Directory`.
 * - **Timestamps are naive**, i.e. `"2026-08-14T06:30:00"` with no offset, and
 *   are wall-clock times in the club's own zone. See `./naive.ts`.
 *
 * Unlike the desktop app, this runs on a server shared by every member, so the
 * one thing added here is caching: the directory and the planning grid are the
 * same bytes for everyone at the club, and re-fetching them per visitor would
 * be both slow and rude to the club's API.
 */

import { type Naive, type NaiveDate, minutesBetween, parseNaive } from '#shared/naive'

const API_BASE = 'https://api.uk.resamania.com'

/** Resamania is multi-tenant; every path is prefixed with the tenant's "client token". */
const CLIENT_TOKEN = 'bigbox'

/**
 * OAuth2 client credentials. Not secrets in any meaningful sense — they are
 * compiled into the member web app's public JavaScript bundle as the fallback
 * values for `REACT_APP_OAUTH_CLIENTID` / `REACT_APP_OAUTH_CLIENTSECRET`, and
 * identify the *application*, not the user.
 */
const OAUTH_CLIENT_ID = '33_v1q53htcy2imed6hm975i2hg37v3agspda7xmwo18oeueoh0qvd'
const OAUTH_CLIENT_SECRET = 'm4br8ty78lxlpxusbkxm35iwypb2zfcdn25429b0gpp185xj5qx'
const REDIRECT_URI = 'https://member.uk.resamania.com/'

/** Refresh this far before actual expiry, so a request never races the deadline. */
const REFRESH_MARGIN_MS = 60_000

/** Backstop against a pagination bug turning into an unbounded loop. */
const MAX_PAGES = 100

// --- Errors ---

export type ApiErrorKind = 'invalid_credentials' | 'session_expired' | 'other'

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static invalidCredentials() {
    return new ApiError('invalid_credentials', 'That email and password were not accepted.')
  }

  static sessionExpired() {
    return new ApiError('session_expired', 'Your session has expired. Please sign in again.')
  }
}

// --- Session ---

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface Tokens {
  access: string
  refresh: string
  expiresAt: number
}

/**
 * The subset of the access token's JWT claims the client needs. The member web
 * app does the same thing — the token is the only place `targetId` appears.
 */
interface Claims {
  /** IRI of the logged-in *user*, e.g. `/bigbox/contact_users/2288503`. */
  targetId: string
  email: string
}

/**
 * Who the session belongs to.
 *
 * Booking requires denormalised copies of several of these fields, which is
 * why login resolves the full contact record up front rather than lazily.
 */
export interface Profile {
  /** IRI, e.g. `/bigbox/contacts/2327536`. */
  contactId: string
  /** IRI, e.g. `/bigbox/contact_users/2288503`. */
  contactUserId: string
  /** IRI of the member's home club, e.g. `/bigbox/clubs/270`. */
  clubId: string
  /** Human-facing membership number, e.g. `C2327536`. */
  number: string
  givenName: string
  familyName: string
  email: string
  /** Naive timestamp string, echoed back verbatim when booking. */
  createdAt: string
}

export function fullName(profile: Pick<Profile, 'givenName' | 'familyName'>): string {
  return `${profile.givenName} ${profile.familyName}`.trim()
}

// --- Entities ---

export interface ClassEvent {
  '@id': string
  club?: string | null
  studio?: string | null
  activity?: string | null
  coach?: string | null
  /** Total capacity, including places not offered online. */
  attendingLimit?: number | null
  /** Cap on how many of those places online members may take. */
  onlineLimit?: number | null
  queueLimit?: number | null
  attendeeRemaining?: number | null
  onlineAttendeeRemaining?: number | null
  queueRemaining?: number | null
  startedAt?: string | null
  endedAt?: string | null
  coachAvailable?: boolean
  summary?: string | null
  description?: string | null
  instructionsComment?: string | null
  bookedAttendees?: Attendee[]
  queuedAttendees?: Attendee[]
  deletedAt?: string | null
}

export interface Attendee {
  '@id': string
  contactId?: string | null
  /**
   * Workflow state, e.g. `booked`, `queued`, `canceled`. Absent on the
   * summarised attendees embedded in a `ClassEvent` listing.
   */
  state?: string | null
  /**
   * The class this booking is for. Present when the attendee came from
   * `myBookings` or `book`, absent when it came embedded in a `ClassEvent`.
   */
  classEvent?: ClassEvent | null
  showed?: boolean
  /** Set once the class is close enough that cancelling is no longer allowed. */
  cancelDelayOver?: boolean
}

export interface Activity {
  '@id': string
  name?: string | null
  /** Used by the member web app to colour the planning grid, e.g. `#fcc400`. */
  colorHex?: string | null
  isBookable?: boolean
}

export interface Coach {
  '@id': string
  givenName?: string | null
  familyName?: string | null
  /** Preferred display name, when the coach has one. */
  alternateName?: string | null
}

export interface Studio {
  '@id': string
  name?: string | null
  club?: string | null
}

export interface Club {
  '@id': string
  name?: string | null
  /** IANA zone the club's naive timestamps are expressed in. */
  timezone?: string | null
  locale?: string | null
}

// --- Entity logic ---

export const classStart = (event: ClassEvent) => parseNaive(event.startedAt)
export const classEnd = (event: ClassEvent) => parseNaive(event.endedAt)

export function classDurationMinutes(event: ClassEvent): number | null {
  const start = classStart(event)
  const end = classEnd(event)
  return start && end ? minutesBetween(start, end) : null
}

/**
 * Whether a booking still stands.
 *
 * Attendees embedded in a `ClassEvent` carry no `state`, but the API only
 * lists live ones there, so a missing state means active. Note the API spells
 * the cancelled state `canceled`; both spellings are accepted because the
 * member web app's own bundle uses them interchangeably.
 */
export function isActive(attendee: Attendee): boolean {
  const state = attendee.state ?? undefined
  return state !== 'canceled' && state !== 'cancelled' && state !== 'refused'
}

/** Whether this is a waiting-list place rather than a seat. */
export const isQueued = (attendee: Attendee) => attendee.state === 'queued'

/** Whether cancelling is still permitted — false once the club's deadline has passed. */
export const isCancellable = (attendee: Attendee) =>
  isActive(attendee) && !attendee.cancelDelayOver

/**
 * This member's attendee record, whether they hold a seat or a waiting-list
 * place. A cancelled booking still appears in `bookedAttendees`, so callers
 * that only care about live bookings should also check `isActive`.
 */
export function myAttendee(event: ClassEvent, contactId: string): Attendee | undefined {
  return [...(event.bookedAttendees ?? []), ...(event.queuedAttendees ?? [])].find(
    attendee => attendee.contactId === contactId,
  )
}

const holdsPlace = (attendees: Attendee[] = [], contactId: string) =>
  attendees.some(attendee => attendee.contactId === contactId && isActive(attendee))

/**
 * Whether this member holds an actual seat — *not* a waiting-list place. The
 * two lists are separate, and conflating them would tell someone they have a
 * spot when they are only queued for one.
 */
export const isBookedBy = (event: ClassEvent, contactId: string) =>
  holdsPlace(event.bookedAttendees, contactId)

export const isQueuedBy = (event: ClassEvent, contactId: string) =>
  holdsPlace(event.queuedAttendees, contactId)

/**
 * This member's 1-based place in the waiting list.
 *
 * The API exposes no explicit position, but returns `queuedAttendees` in
 * ascending attendee id — i.e. the order people joined — so the index is the
 * position.
 */
export function queuePosition(event: ClassEvent, contactId: string): number | null {
  const index = (event.queuedAttendees ?? []).findIndex(
    attendee => attendee.contactId === contactId,
  )
  return index === -1 ? null : index + 1
}

/**
 * Places still bookable online. Falls back to the overall remaining count for
 * classes with no separate online cap.
 */
export function placesRemaining(event: ClassEvent): number | null {
  return event.onlineAttendeeRemaining ?? event.attendeeRemaining ?? null
}

export function isFull(event: ClassEvent): boolean {
  const free = placesRemaining(event)
  return free !== null && free <= 0
}

/**
 * How many people are on the waiting list, or `null` when the class has no
 * queue information at all.
 *
 * Counted from `queuedAttendees` in preference to the `queueLimit -
 * queueRemaining` arithmetic, even though both should agree. The queue
 * *position* shown next to this count is an index into that same array, so
 * taking the total from anywhere else risks telling somebody they are "#4 of
 * 3". The API only lists live attendees in a class listing, so there are no
 * cancellations in there to overcount.
 *
 * The counters are the fallback, for the thinner class records embedded in a
 * booking, which carry no attendee lists.
 */
export function queuedCount(event: ClassEvent): number | null {
  if (event.queuedAttendees) return event.queuedAttendees.filter(isActive).length

  const { queueLimit: limit, queueRemaining: remaining } = event
  if (limit === null || limit === undefined) return null
  if (remaining === null || remaining === undefined) return null

  return Math.max(0, limit - remaining)
}

/** True when the class is full but its waiting list still has room. */
export function hasQueueSpace(event: ClassEvent): boolean {
  return isFull(event) && (event.queueRemaining ?? 0) > 0
}

export const isCancelledClass = (event: ClassEvent) => Boolean(event.deletedAt)

export function coachDisplayName(coach: Coach): string {
  if (coach.alternateName) return coach.alternateName
  return `${coach.givenName ?? ''} ${coach.familyName ?? ''}`.trim()
}

// --- Directory ---

/** Reference data for resolving a `ClassEvent`'s IRIs into names. */
export interface Directory {
  activities: Record<string, Activity>
  coaches: Record<string, Coach>
  studios: Record<string, Studio>
  clubs: Record<string, Club>
}

const byIri = <T extends { '@id': string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(item => [item['@id'], item]))

const lookup = <T>(table: Record<string, T>, iri: string | null | undefined) =>
  iri ? table[iri] : undefined

export const activityName = (directory: Directory, event: ClassEvent) =>
  lookup(directory.activities, event.activity)?.name ?? null

export const activityColor = (directory: Directory, event: ClassEvent) =>
  lookup(directory.activities, event.activity)?.colorHex ?? null

export const coachName = (directory: Directory, event: ClassEvent) => {
  const coach = lookup(directory.coaches, event.coach)
  return coach ? coachDisplayName(coach) : null
}

export const studioName = (directory: Directory, event: ClassEvent) =>
  lookup(directory.studios, event.studio)?.name ?? null

export const clubName = (directory: Directory, event: ClassEvent) =>
  lookup(directory.clubs, event.club)?.name ?? null

/** A `ClassEvent` with its references resolved — what a UI actually renders. */
export interface PlanningEntry {
  id: string
  name: string
  colorHex: string | null
  coach: string | null
  studio: string | null
  club: string | null
  start: Naive | null
  end: Naive | null
  durationMinutes: number | null
  placesRemaining: number | null
  capacity: number | null
  isFull: boolean
  hasQueueSpace: boolean
  /** How many people are on the waiting list. */
  queueCount: number | null
  /** The cap on the waiting list, so a full queue can be distinguished. */
  queueLimit: number | null
  isCancelled: boolean
  description: string | null
  /** Whether the logged-in member holds an actual seat. */
  booked: boolean
  /** Whether the member is on the waiting list rather than booked in. */
  queued: boolean
  /** The member's 1-based place in the waiting list, when queued. */
  queuePosition: number | null
  /**
   * The member's attendee IRI, to pass to `cancel`. Set whether they hold a
   * seat or a queue place — cancelling works the same for both.
   */
  attendeeId: string | null
}

export function resolve(
  directory: Directory,
  event: ClassEvent,
  contactId: string,
): PlanningEntry {
  return {
    id: event['@id'],
    name: activityName(directory, event) ?? 'Class',
    colorHex: activityColor(directory, event),
    coach: coachName(directory, event),
    studio: studioName(directory, event),
    club: clubName(directory, event),
    start: classStart(event),
    end: classEnd(event),
    durationMinutes: classDurationMinutes(event),
    placesRemaining: placesRemaining(event),
    capacity: event.attendingLimit ?? null,
    isFull: isFull(event),
    hasQueueSpace: hasQueueSpace(event),
    queueCount: queuedCount(event),
    queueLimit: event.queueLimit ?? null,
    isCancelled: isCancelledClass(event),
    description: event.description ?? event.summary ?? null,
    booked: isBookedBy(event, contactId),
    queued: isQueuedBy(event, contactId),
    queuePosition: queuePosition(event, contactId),
    attendeeId: myAttendee(event, contactId)?.['@id'] ?? null,
  }
}

/**
 * The classes someone is actually going to, out of a set of attendee records.
 *
 * Three things have to be excluded and it is easy to forget one: `myBookings`
 * returns a member's whole history, cancellations stay in the list with a
 * `canceled` state, and a waiting-list place is not a booking. Miss the date
 * check in particular and a regular member looks like they have dozens of
 * upcoming classes when they have none.
 */
export function upcomingClassIds(attendees: Attendee[], now: Naive): Set<string> {
  return new Set(
    attendees
      .filter(attendee => isActive(attendee) && !isQueued(attendee))
      .map(attendee => attendee.classEvent)
      .filter((event): event is ClassEvent => Boolean(event))
      .filter(event => {
        const start = classStart(event)
        return start !== null && start >= now
      })
      .map(event => event['@id']),
  )
}

// --- Hydra envelope ---

interface Collection<T> {
  'hydra:member'?: T[]
  member?: T[]
  'hydra:view'?: { 'hydra:next'?: string }
  view?: { next?: string }
}

const members = <T>(page: Collection<T>): T[] => page['hydra:member'] ?? page.member ?? []

const nextPage = <T>(page: Collection<T>): string | undefined =>
  page['hydra:view']?.['hydra:next'] ?? page.view?.next

// --- Helpers ---

/** Turns an IRI or bare collection name into an absolute URL. */
function absolute(path: string): string {
  if (path.startsWith('http')) return path
  if (path.startsWith('/')) return `${API_BASE}${path}`
  return `${API_BASE}/${CLIENT_TOKEN}/${path}`
}

/**
 * Accepts either a full IRI or a bare id and returns an IRI, so callers can
 * pass whichever they have.
 */
function collectionPath(collection: string, idOrIri: string): string {
  return idOrIri.startsWith('/') ? idOrIri : `/${CLIENT_TOKEN}/${collection}/${idOrIri}`
}

/**
 * Reads the claims out of a JWT without verifying it — the server is the one
 * that validates the signature; this only needs the payload's contents.
 */
function decodeClaims(jwt: string): Claims {
  const payload = jwt.split('.')[1]
  if (!payload) throw new ApiError('other', 'Malformed access token')
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims
  } catch (error) {
    throw new ApiError('other', `Unexpected access token claims: ${error}`)
  }
}

type Query = Record<string, string | number | undefined>

function withQuery(url: string, query: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.append(key, String(value))
  }
  const search = params.toString()
  return search ? `${url}?${search}` : url
}

// --- Client ---

export class Client {
  private tokens: Tokens
  /** Dedupes concurrent refreshes; several in-flight requests share one. */
  private refreshing: Promise<Tokens> | null = null

  private constructor(
    tokens: Tokens,
    readonly profile: Profile,
  ) {
    this.tokens = tokens
  }

  /** Logs in with a member's email and password and resolves their profile. */
  static async login(email: string, password: string): Promise<Client> {
    const tokens = await requestToken({
      grant_type: 'password',
      username: email,
      password,
    })

    const claims = decodeClaims(tokens.access)

    // `targetId` is a contact_user; the contact it points at is the record
    // that owns bookings, so both are needed.
    const bootstrap = new Client(tokens, {
      contactId: '',
      contactUserId: claims.targetId,
      clubId: '',
      number: '',
      givenName: '',
      familyName: '',
      email: claims.email,
      createdAt: '',
    })

    const user = await bootstrap.get<{ contactId: string }>(claims.targetId)
    const contact = await bootstrap.get<{
      '@id': string
      number?: string
      givenName?: string
      familyName?: string
      clubId?: string
      createdAt?: string
    }>(user.contactId)

    return new Client(bootstrap.tokens, {
      contactId: contact['@id'],
      contactUserId: claims.targetId,
      clubId: contact.clubId ?? '',
      number: contact.number ?? '',
      givenName: contact.givenName ?? '',
      familyName: contact.familyName ?? '',
      email: claims.email,
      createdAt: contact.createdAt ?? '',
    })
  }

  // --- Transport ---

  /** Returns a usable access token, refreshing first if it is at or near expiry. */
  private async accessToken(): Promise<string> {
    if (Date.now() + REFRESH_MARGIN_MS < this.tokens.expiresAt) return this.tokens.access
    return (await this.refresh()).access
  }

  private refresh(): Promise<Tokens> {
    this.refreshing ??= requestToken({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh,
    })
      .catch((error: unknown) => {
        // A rejected refresh token means the session is genuinely over, which
        // is a different remedy than "your password was wrong".
        if (error instanceof ApiError && error.kind === 'invalid_credentials') {
          throw ApiError.sessionExpired()
        }
        throw error
      })
      .then(tokens => {
        this.tokens = tokens
        return tokens
      })
      .finally(() => {
        this.refreshing = null
      })

    return this.refreshing
  }

  /**
   * Sends an authenticated request, retrying once against a freshly refreshed
   * token if the first attempt is rejected. A token can be rejected despite
   * looking fresh — the server may have revoked it.
   */
  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    const attempt = async (token: string) =>
      fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          accept: 'application/ld+json',
          authorization: `Bearer ${token}`,
        },
      })

    let response = await attempt(await this.accessToken())

    if (response.status === 401) {
      response = await attempt((await this.refresh()).access)
    }

    if (response.status === 401) throw ApiError.sessionExpired()

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ApiError('other', `Request failed (${response.status}): ${body.slice(0, 500)}`)
    }

    return response
  }

  /**
   * GETs `path`, which may be either an IRI (`/bigbox/contacts/1`) or a bare
   * collection name (`contacts`).
   */
  private async get<T>(path: string, query: Query = {}): Promise<T> {
    const response = await this.send(withQuery(absolute(path), query))
    try {
      return (await response.json()) as T
    } catch (error) {
      throw new ApiError('other', `Parse error for ${path}: ${error}`)
    }
  }

  /** GETs every page of a Hydra collection, following `hydra:next`. */
  private async getAll<T>(path: string, query: Query = {}): Promise<T[]> {
    const items: T[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const collection = await this.get<Collection<T>>(path, { ...query, page })
      items.push(...members(collection))
      if (!nextPage(collection)) break
    }
    return items
  }

  // --- Planning ---

  /**
   * Fetches the class planning for a club over a date range.
   *
   * `from` is inclusive and `to` is exclusive, matching the API's
   * `startedAt[after]` / `startedAt[before]` filters. Both bounds are required:
   * the planning runs months ahead, so an open-ended range would page until
   * `MAX_PAGES`.
   */
  planning(clubId: string, from: NaiveDate, to: NaiveDate): Promise<ClassEvent[]> {
    return this.getAll<ClassEvent>('class_events', {
      club: clubId,
      'startedAt[after]': from,
      'startedAt[before]': to,
      'order[startedAt]': 'asc',
    })
  }

  /**
   * Fetches bookings for classes starting on or after `from`, oldest first.
   *
   * The date bound is applied by the server, so this pages through the
   * member's next few bookings rather than their entire history. The filter is
   * whole-day inclusive: passing today returns classes from earlier today too,
   * so callers wanting strictly-future bookings should still compare against
   * the current time.
   */
  bookingsFrom(from: NaiveDate): Promise<Attendee[]> {
    return this.fetchBookings({ 'classEvent.startedAt[after]': from })
  }

  /**
   * Fetches the member's bookings, oldest class first.
   *
   * This returns *every* attendee record for all time, including past classes
   * and cancelled ones — for a regular member that is dozens of rows over many
   * pages. Prefer `bookingsFrom` unless you genuinely want the history.
   */
  myBookings(): Promise<Attendee[]> {
    return this.fetchBookings({})
  }

  private async fetchBookings(filters: Query): Promise<Attendee[]> {
    const bookings = await this.getAll<Attendee>('attendees', {
      contactId: this.profile.contactId,
      ...filters,
    })

    // Sorted here rather than by the server: `order[classEvent.startedAt]` is
    // advertised in the collection's Hydra search mapping but returns a 500,
    // and the embedded class carries the time anyway.
    return bookings.sort((a, b) => {
      const left = (a.classEvent && classStart(a.classEvent)) ?? ''
      const right = (b.classEvent && classStart(b.classEvent)) ?? ''
      return left.localeCompare(right)
    })
  }

  /** Fetches one class event by IRI or numeric id. */
  classEvent(id: string): Promise<ClassEvent> {
    return this.get<ClassEvent>(collectionPath('class_events', id))
  }

  // --- Lookups ---

  /**
   * Fetches the reference data needed to turn a `ClassEvent`'s IRIs into
   * names. Each of these is a small, unpaginated collection.
   */
  async directory(): Promise<Directory> {
    const [activities, coaches, studios, clubs] = await Promise.all([
      this.getAll<Activity>('activities'),
      this.getAll<Coach>('coaches'),
      this.getAll<Studio>('studios'),
      this.getAll<Club>('clubs'),
    ])

    return {
      activities: byIri(activities),
      coaches: byIri(coaches),
      studios: byIri(studios),
      clubs: byIri(clubs),
    }
  }

  clubs(): Promise<Club[]> {
    return this.getAll<Club>('clubs')
  }

  // --- Booking ---

  /**
   * Books the member onto a class, returning the created attendee.
   *
   * This is also how you join a waiting list: the request is byte-identical
   * either way and the server decides, so check `isQueued` on the result
   * rather than assuming a seat.
   *
   * The API wants the contact's details denormalised into the request body
   * rather than looked up from `contactId`, which is why login resolves the
   * full contact record.
   */
  async book(classEvent: string): Promise<Attendee> {
    const response = await this.send(absolute('attendees'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contactId: this.profile.contactId,
        contactClubId: this.profile.clubId,
        contactNumber: this.profile.number,
        contactFamilyName: this.profile.familyName,
        contactGivenName: this.profile.givenName,
        contactCreatedAt: this.profile.createdAt,
        classEvent: collectionPath('class_events', classEvent),
      }),
    })

    return (await response.json()) as Attendee
  }

  /**
   * Cancels a booking. `attendee` is the IRI or id from `myAttendee`.
   *
   * Bookings are a state machine and cancelling is a *transition* on the
   * attendee, not a delete — the record survives with a `cancelled` state.
   */
  async cancel(attendee: string): Promise<void> {
    await this.send(absolute(`${collectionPath('attendees', attendee)}/transitions`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transition: 'cancel' }),
    })
  }
}

/** The OAuth2 token endpoint, used for both the password and refresh grants. */
async function requestToken(grant: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${API_BASE}/${CLIENT_TOKEN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      ...grant,
    }),
  })

  if (response.status === 400 || response.status === 401) {
    throw ApiError.invalidCredentials()
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new ApiError('other', `Token request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  const token = (await response.json()) as TokenResponse
  return {
    access: token.access_token,
    refresh: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}
