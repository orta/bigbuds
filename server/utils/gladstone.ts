/**
 * Client for the Gladstone ("GS") member API that backs the KAL leisure clubs.
 *
 * This replaces the Resamania client the app was first built against — the new
 * gym runs on Gladstone, reached through Innovatise's "MyFitApp" white-label
 * shell (the KAL app). The shell only serves config and a home screen; login
 * and booking go straight to Gladstone, so this talks to Gladstone directly
 * and ignores the shell entirely.
 *
 * It deliberately keeps the *shape* of the old Resamania client — the same
 * `Client` methods, the same `ClassEvent` / `Attendee` / `Directory` /
 * `PlanningEntry` types, the same helper functions — so the rest of the app
 * (promotions, notices, the calendar feed, the shared timetable) did not have
 * to change. Two facts about Gladstone are absorbed here at the boundary:
 *
 * - **Timestamps are Unix epoch seconds, UTC.** Everything above this file
 *   speaks naive wall-clock strings in the club's zone (see `./naive` /
 *   `#shared/naive`, which fix the zone at `Europe/London` — Gladstone's own
 *   site timezone). Epochs are converted to those strings on the way out and
 *   back to epochs on the way in, so nothing downstream sees a `Date`.
 * - **Entities have string ids, not IRIs.** Resamania referenced everything by
 *   IRI (`/bigbox/class_events/1722803`); Gladstone uses bare ids and carries
 *   display names inline on each session. To keep the store's filenames and
 *   the app's id handling working unchanged, GS ids are wrapped in synthetic
 *   IRIs (`/gs/sessions/80300672`, `/gs/contacts/8035356`) here, and unwrapped
 *   again before they go back to Gladstone.
 *
 * Authentication is unusual and also hidden here: there is no refreshable
 * token. Gladstone validates the member's `user`/`pw` on *every* request, sent
 * as headers alongside a fixed application `AuthenticationKey`. The client
 * therefore holds the member's credentials in memory for the life of the
 * session, exactly as the official app does.
 */

import type { Naive, NaiveDate } from '#shared/naive'
import { CLUB_TIMEZONE, minutesBetween, parseNaive } from '#shared/naive'

/** Gladstone API root for the KAL tenant. From the app's `gsSettings.baseUrl`. */
const API_BASE = 'https://kal.gs-signature.cloud/AWS'

/**
 * The fixed application key Gladstone expects in the `AuthenticationKey`
 * header. Not a secret: it is delivered in cleartext to the KAL app in its
 * `appConfig` response and identifies the *application*, not the member.
 */
const AUTHENTICATION_KEY = 'M0bi1eProB00king$'

/**
 * Which activity "scope" the class timetable is drawn from.
 *
 * Gladstone groups bookable things by activity group; the gym's fitness-class
 * timetable lives under `FITC` ("Fitness Classes"). Overridable per deployment
 * in case another club files its classes elsewhere.
 */
const SCOPE_IDS = process.env.KAL_SCOPE_IDS || 'FITC'

/** A User-Agent in the shape the KAL app sends, so we look like a known client. */
const USER_AGENT = 'kalorg/705800 Android 14 Pixel 7'

/**
 * How far ahead to look when listing a member's own bookings.
 *
 * Unlike Resamania, Gladstone has no "my bookings" call that yields a session
 * id to cancel by — the authoritative way to find a booking *and* act on it is
 * to read the timetable and keep the ones the member holds. The club only
 * takes bookings a couple of weeks out, so a four-week forward window covers
 * everything bookable with room to spare.
 */
const BOOKING_WINDOW_DAYS = 28

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

// --- IRIs ---
//
// Synthetic IRIs keep the rest of the app — which was written for Resamania's
// IRI-everywhere model, right down to the store's filenames — working against
// Gladstone's bare ids. The wrapping is confined to this file.

const contactIri = (memberId: string | number) => `/gs/contacts/${memberId}`
const siteIri = (siteId: string) => `/gs/sites/${siteId}`
const sessionIri = (sessionId: string | number) => `/gs/sessions/${sessionId}`

/**
 * A stable id for a *class type*, derived from its title.
 *
 * Attendance counts and a member's notes are keyed by class type, not by the
 * individual session — a note about "Strength Development" is about the class,
 * not about one Sunday's instance. Gladstone gives no stable type id on a
 * session, only the title, so the slugged title is the key. Same title next
 * week resolves to the same id, which is exactly what keeps a note attached.
 */
const activityIri = (title: string) =>
  `/gs/activities/${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class'}`

/** The bare site id out of a `/gs/sites/CVLC` IRI, or the value unchanged. */
export const siteIdOf = (iri: string) => (iri.startsWith('/gs/sites/') ? iri.slice('/gs/sites/'.length) : iri)

/** The bare numeric session id out of a `/gs/sessions/123` IRI, or the value unchanged. */
const sessionIdOf = (idOrIri: string) =>
  idOrIri.startsWith('/gs/sessions/') ? idOrIri.slice('/gs/sessions/'.length) : idOrIri

// --- Time ---
//
// Gladstone speaks Unix epoch seconds; everything above speaks naive
// wall-clock strings in `CLUB_TIMEZONE`. These are the only two places the two
// representations meet.

const naiveFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLUB_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** An epoch-seconds instant as a naive wall-clock string in the club's zone. */
function epochToNaive(seconds: number | null | undefined): Naive | null {
  if (seconds === null || seconds === undefined) return null
  const parts = naiveFormat.formatToParts(new Date(seconds * 1000))
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '00'
  // `hour12: false` yields hour 24 rather than 00 at midnight in some engines.
  const hour = at('hour') === '24' ? '00' : at('hour')
  return `${at('year')}-${at('month')}-${at('day')}T${hour}:${at('minute')}:${at('second')}`
}

/**
 * How far the club's zone is ahead of UTC at a given instant, in milliseconds.
 *
 * `Intl` is the only thing that knows which side of a DST boundary a date
 * falls on, so the offset is read back out of a formatted date rather than
 * assumed to be a fixed hour.
 */
function clubOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? '0')
  const hour = at('hour') === 24 ? 0 : at('hour')
  const asUTC = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'), at('second'))
  return asUTC - date.getTime()
}

/**
 * Midnight at the start of a naive date, in the club's zone, as epoch seconds.
 *
 * The planning window's bounds arrive as zoneless `YYYY-MM-DD` dates; Gladstone
 * wants the epoch instant of local midnight. The offset is sampled at the naive
 * instant and subtracted — correct except in the hour a clock change skips,
 * which no class timetable turns on.
 */
function naiveDateToEpoch(date: NaiveDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0)
  return Math.floor((guess - clubOffsetMs(new Date(guess))) / 1000)
}

// --- Entities ---
//
// Shaped to match what the app's helpers and `resolve` read. A `ClassEvent`
// here is a Gladstone session, normalised and carrying the member's own
// booking state inline (Gladstone personalises the timetable per member).

export interface ClassEvent {
  '@id': string
  /** The bare Gladstone session id, for booking and cancelling. */
  sessionId: number
  title: string
  description?: string | null
  /** Bare site id, e.g. `CVLC`. */
  siteId?: string | null
  siteName?: string | null
  /** Activity-group id, e.g. `FITC`. */
  activityGroupId?: string | null
  /** The room/resource, e.g. "Spin Studio". Used where Resamania had a studio. */
  resourceName?: string | null
  /** Naive start/end in the club's zone. */
  startedAt?: string | null
  endedAt?: string | null
  /** Total places. */
  slotsTotal?: number | null
  /** Places still free. */
  slotsAvailable?: number | null
  /** How many people are on the waiting list. */
  waitListCount?: number | null
  /** The member's own state: `Unbooked`, `Booked`, or `BookedWaitingList`. */
  myBookingStatus?: string | null
  /** The member's 1-based waiting-list place, when Gladstone reports it. */
  waitListPos?: number | null
  /** Whether cancelling is still offered to the member. */
  showCancel?: boolean
  /** Whether booking (or joining the waiting list) is still offered. */
  showBook?: boolean
  deletedAt?: string | null
}

/**
 * A member's place at a class.
 *
 * Gladstone has no standalone attendee record — a booking *is* a session the
 * member holds — so this wraps the session with the member's role on it. The
 * `@id` is the session IRI, which is what both booking and cancelling key on.
 */
export interface Attendee {
  '@id': string
  contactId?: string | null
  /** `booked`, `queued`, or `canceled`. */
  state?: string | null
  /** The session this is a place at. Always present here. */
  classEvent?: ClassEvent | null
  /** True once the club's deadline has passed and cancelling is refused. */
  cancelDelayOver?: boolean
}

/** A badge scan at a door. Gladstone exposes none; kept for type compatibility. */
export interface Entry {
  '@id': string
  targetId?: string | null
  crossingPoint?: string | null
  createdAt?: string | null
  type?: string | null
}

export interface Activity {
  '@id': string
  name?: string | null
  colorHex?: string | null
  isBookable?: boolean
}

export interface Coach {
  '@id': string
  givenName?: string | null
  familyName?: string | null
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
  timezone?: string | null
  locale?: string | null
}

/**
 * Who the session belongs to.
 *
 * The same field names the Resamania client used, so `signIn` and the session
 * cookie did not have to change. `contactUserId` has no separate meaning in
 * Gladstone — there is one identity, the member — so it mirrors `contactId`.
 */
export interface Profile {
  /** IRI, e.g. `/gs/contacts/8035356`. */
  contactId: string
  /** Mirrors `contactId`; Gladstone has no separate user/contact split. */
  contactUserId: string
  /** The member's home site as an IRI, e.g. `/gs/sites/CVLC`. */
  clubId: string
  /** Membership/card number, e.g. `KALM358147`. */
  number: string
  givenName: string
  familyName: string
  email: string
  /** ISO join date, echoed where the app expects a `createdAt`. */
  createdAt: string
}

export function fullName(profile: Pick<Profile, 'givenName' | 'familyName'>): string {
  return `${profile.givenName} ${profile.familyName}`.trim()
}

// --- Entity logic ---
//
// Same signatures as the Resamania helpers, so callers are unchanged; they read
// Gladstone's inline fields rather than resolving IRIs through a directory.

export const classStart = (event: ClassEvent) => parseNaive(event.startedAt)
export const classEnd = (event: ClassEvent) => parseNaive(event.endedAt)

export function classDurationMinutes(event: ClassEvent): number | null {
  const start = classStart(event)
  const end = classEnd(event)
  return start && end ? minutesBetween(start, end) : null
}

/** Whether a booking still stands. A missing state means active. */
export function isActive(attendee: Attendee): boolean {
  const state = attendee.state ?? undefined
  return state !== 'canceled' && state !== 'cancelled' && state !== 'refused'
}

/** Whether this is a waiting-list place rather than a seat. */
export const isQueued = (attendee: Attendee) => attendee.state === 'queued'

/** Whether cancelling is still permitted. */
export const isCancellable = (attendee: Attendee) =>
  isActive(attendee) && !attendee.cancelDelayOver

/** The member's own role on a session, synthesised from its inline state. */
export function myAttendee(event: ClassEvent, contactId: string): Attendee | undefined {
  const status = event.myBookingStatus
  if (!status || status === 'Unbooked') return undefined
  return {
    '@id': event['@id'],
    contactId,
    state: status === 'BookedWaitingList' ? 'queued' : 'booked',
    classEvent: event,
    cancelDelayOver: !event.showCancel,
  }
}

/** Whether this member holds an actual seat — not a waiting-list place. */
export const isBookedBy = (event: ClassEvent, _contactId: string) =>
  event.myBookingStatus === 'Booked'

export const isQueuedBy = (event: ClassEvent, _contactId: string) =>
  event.myBookingStatus === 'BookedWaitingList'

/** The member's 1-based place in the waiting list, when Gladstone reports it. */
export function queuePosition(event: ClassEvent, _contactId: string): number | null {
  return isQueuedBy(event, _contactId) ? event.waitListPos ?? null : null
}

/** Places still bookable. */
export function placesRemaining(event: ClassEvent): number | null {
  return event.slotsAvailable ?? null
}

export function isFull(event: ClassEvent): boolean {
  const free = placesRemaining(event)
  return free !== null && free <= 0
}

/** How many people are on the waiting list, or `null` if unknown. */
export function queuedCount(event: ClassEvent): number | null {
  return event.waitListCount ?? null
}

/** True when the class is full but still offers a waiting-list place. */
export function hasQueueSpace(event: ClassEvent): boolean {
  // Gladstone keeps offering "book" (which joins the waiting list) while a full
  // class still accepts queuers, so the member's own offer is the signal.
  return isFull(event) && (event.showBook ?? false)
}

export const isCancelledClass = (event: ClassEvent) => Boolean(event.deletedAt)

export function coachDisplayName(coach: Coach): string {
  if (coach.alternateName) return coach.alternateName
  return `${coach.givenName ?? ''} ${coach.familyName ?? ''}`.trim()
}

// --- Directory ---
//
// Gladstone carries display names inline on each session, so there is nothing
// to resolve. The type and the lookups are kept so callers are unchanged; the
// directory is always empty and the lookups read the event directly.

export interface Directory {
  activities: Record<string, Activity>
  coaches: Record<string, Coach>
  studios: Record<string, Studio>
  clubs: Record<string, Club>
}

export const EMPTY_DIRECTORY: Directory = {
  activities: {},
  coaches: {},
  studios: {},
  clubs: {},
}

export const activityName = (_directory: Directory, event: ClassEvent) => event.title ?? null

/**
 * The class-type id for a session, for keying notes and attendance.
 *
 * The Resamania client had this as the event's `activity` IRI; Gladstone has no
 * such field, so it is derived from the title — stable across the weekly
 * repeats of the same class, which is what keeps a note or a count attached.
 */
export const classActivityId = (event: ClassEvent): string | null =>
  event.title ? activityIri(event.title) : null

export const activityColor = (_directory: Directory, _event: ClassEvent) => null

export const coachName = (_directory: Directory, _event: ClassEvent) => null

export const studioName = (_directory: Directory, event: ClassEvent) => event.resourceName ?? null

export const clubName = (_directory: Directory, event: ClassEvent) => event.siteName ?? null

/** A `ClassEvent` with everything a UI renders worked out. */
export interface PlanningEntry {
  id: string
  activityId: string | null
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
  queueCount: number | null
  queueLimit: number | null
  isCancelled: boolean
  description: string | null
  booked: boolean
  queued: boolean
  queuePosition: number | null
  attendeeId: string | null
}

export function resolve(
  _directory: Directory,
  event: ClassEvent,
  contactId: string,
): PlanningEntry {
  const booked = isBookedBy(event, contactId)
  const queued = isQueuedBy(event, contactId)
  return {
    id: event['@id'],
    activityId: event.title ? activityIri(event.title) : null,
    name: event.title ?? 'Class',
    colorHex: null,
    coach: null,
    studio: event.resourceName ?? null,
    club: event.siteName ?? null,
    start: classStart(event),
    end: classEnd(event),
    durationMinutes: classDurationMinutes(event),
    placesRemaining: placesRemaining(event),
    capacity: event.slotsTotal ?? null,
    isFull: isFull(event),
    hasQueueSpace: hasQueueSpace(event),
    queueCount: queuedCount(event),
    // Gladstone does not publish a waiting-list cap, so a full queue cannot be
    // distinguished from an open one — the queue count is shown without it.
    queueLimit: null,
    isCancelled: isCancelledClass(event),
    description: event.description ?? null,
    booked,
    queued,
    queuePosition: queuePosition(event, contactId),
    attendeeId: booked || queued ? event['@id'] : null,
  }
}

/**
 * The classes someone is actually going to, out of a set of attendee records.
 *
 * Cancellations and waiting-list places are excluded, as is anything in the
 * past, matching the Resamania client's contract.
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

// --- Raw Gladstone shapes ---

interface LoginResponse {
  responseDocType?: string
  errorCode?: string
  errorDescription?: string
  tokenValue?: string
  id?: number
  accessId?: string
  firstNames?: string
  lastName?: string
}

interface ProfileResponse {
  memberId?: number
  firstName?: string
  lastName?: string
  email?: string
  preferredSiteId?: string
  preferredSiteDesc?: string
  joinDate?: string
  accessIds?: { id?: string }[]
  errorCode?: string
}

interface RawSession {
  id: number
  title?: string
  description?: string | null
  siteId?: string | null
  siteName?: string | null
  activityGroupID?: string | null
  resourceName?: string | null
  startTimeUTC?: number | null
  endTimeUTC?: number | null
  slotsTotal?: number | null
  slotsAvailable?: number | null
  waitListCount?: number | null
  myBookingStatus?: string | null
  waitListPos?: number | null
  showCancel?: boolean
  showBook?: boolean
}

interface SessionsResponse {
  sessions?: RawSession[]
  responseDocType?: string
  errorCode?: string
  errorDescription?: string
}

/** Normalises one raw Gladstone session into the app's `ClassEvent`. */
function toClassEvent(raw: RawSession): ClassEvent {
  return {
    '@id': sessionIri(raw.id),
    sessionId: raw.id,
    title: raw.title ?? 'Class',
    description: raw.description ?? null,
    siteId: raw.siteId ?? null,
    siteName: raw.siteName ?? null,
    activityGroupId: raw.activityGroupID ?? null,
    resourceName: raw.resourceName ?? null,
    startedAt: epochToNaive(raw.startTimeUTC),
    endedAt: epochToNaive(raw.endTimeUTC),
    slotsTotal: raw.slotsTotal ?? null,
    slotsAvailable: raw.slotsAvailable ?? null,
    waitListCount: raw.waitListCount ?? null,
    myBookingStatus: raw.myBookingStatus ?? null,
    waitListPos: raw.waitListPos ?? null,
    showCancel: raw.showCancel ?? false,
    showBook: raw.showBook ?? false,
  }
}

/** The member's place on a session they hold, or `null` if they hold none. */
function toAttendee(event: ClassEvent, contactId: string): Attendee | null {
  const status = event.myBookingStatus
  if (!status || status === 'Unbooked') return null
  return {
    '@id': event['@id'],
    contactId,
    state: status === 'BookedWaitingList' ? 'queued' : 'booked',
    classEvent: event,
    cancelDelayOver: !event.showCancel,
  }
}

// --- Client ---

export class Client {
  /** Session cache of fetched events, so `classEvent(id)` need not refetch. */
  private readonly events = new Map<string, ClassEvent>()

  private constructor(
    private readonly email: string,
    private readonly password: string,
    readonly profile: Profile,
  ) {}

  /** Logs a member in with their email and password and resolves their profile. */
  static async login(email: string, password: string): Promise<Client> {
    const login = await request<LoginResponse>(email, password, '/api/validateLogin', {
      user: email,
      pw: password,
    })

    if (login.responseDocType === 'ERROR_RESPONSE' || !login.id) {
      if (login.errorCode === 'INVALID_LOGIN') throw ApiError.invalidCredentials()
      throw new ApiError('other', login.errorDescription || 'Login failed')
    }

    // Booking needs the member's home site and number; the profile call is the
    // one place they are both spelled out, so it is resolved up front.
    const profile = await request<ProfileResponse>(email, password, '/api/GetProfile', {})

    const memberId = profile.memberId ?? login.id
    const siteId = profile.preferredSiteId ?? ''

    return new Client(email, password, {
      contactId: contactIri(memberId),
      contactUserId: contactIri(memberId),
      clubId: siteId ? siteIri(siteId) : '',
      number: profile.accessIds?.[0]?.id ?? login.accessId ?? '',
      givenName: profile.firstName ?? login.firstNames ?? '',
      familyName: profile.lastName ?? login.lastName ?? '',
      email: profile.email || email,
      createdAt: profile.joinDate ?? '',
    })
  }

  // --- Transport ---

  private get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    return request<T>(this.email, this.password, path, params)
  }

  /** Remembers fetched events so `classEvent` can serve them without a refetch. */
  private remember(events: ClassEvent[]): ClassEvent[] {
    for (const event of events) this.events.set(event['@id'], event)
    return events
  }

  // --- Planning ---

  /**
   * The class timetable for every site over a date range.
   *
   * `from` is inclusive and `to` exclusive, as whole club-local days, matching
   * the Resamania contract. Gladstone returns every site under the scope in
   * one response, so narrowing to the sites a member cares about is left to
   * the caller — see `sitesFor`.
   */
  async planning(from: NaiveDate, to: NaiveDate): Promise<ClassEvent[]> {
    const raw = await this.get<SessionsResponse>('/api/session', {
      scopeIds: SCOPE_IDS,
      fromUTC: naiveDateToEpoch(from),
      toUTC: naiveDateToEpoch(to),
      globalInfo: 1,
    })

    return this.remember((raw.sessions ?? []).map(toClassEvent))
  }

  /**
   * The member's own bookings from `from` onward, oldest first.
   *
   * Read off the timetable rather than `/api/booking/list`: the timetable is
   * the only source that carries a session id to cancel by, and it also marks
   * the member's state on each class inline. Limited to a forward window —
   * Gladstone only books a few weeks out, so this misses nothing bookable.
   *
   * Every site, not just the member's home one: a booking at the other centre
   * is still a booking, and leaving it out would hide it from everyone else
   * and from the calendar feed.
   */
  async bookingsFrom(from: NaiveDate): Promise<Attendee[]> {
    const to = addNaiveDays(from, BOOKING_WINDOW_DAYS)
    const raw = await this.get<SessionsResponse>('/api/session', {
      scopeIds: SCOPE_IDS,
      fromUTC: naiveDateToEpoch(from),
      toUTC: naiveDateToEpoch(to),
      globalInfo: 1,
    })

    const events = (raw.sessions ?? []).map(toClassEvent)
    this.remember(events)

    return events
      .flatMap(event => {
        const attendee = toAttendee(event, this.profile.contactId)
        return attendee ? [attendee] : []
      })
      .sort((a, b) =>
        (a.classEvent?.startedAt ?? '').localeCompare(b.classEvent?.startedAt ?? ''))
  }

  /**
   * The member's bookings, for the attendance history.
   *
   * Gladstone offers no booking history that yields a usable session, so this
   * is the same forward window as `bookingsFrom` from today. Past attendance is
   * therefore not reconstructable here — `buildAttended` simply sees less.
   */
  myBookings(): Promise<Attendee[]> {
    return this.bookingsFrom(todayClub())
  }

  /** The member's badge scans. Gladstone exposes none, so always empty. */
  async entries(_contactId: string): Promise<Entry[]> {
    return []
  }

  /** One session by id or IRI, served from the session cache. */
  async classEvent(id: string): Promise<ClassEvent> {
    const cached = this.events.get(id.startsWith('/gs/') ? id : sessionIri(id))
    // The timetable the member is looking at already carries the full record
    // (capacity, waiting list, their own state), so a cache miss is rare and
    // the caller falls back to the copy it already holds.
    if (!cached) throw new ApiError('other', `No cached session for ${id}`)
    return cached
  }

  // --- Lookups ---

  /** Kept for interface compatibility; Gladstone needs no directory. */
  async directory(): Promise<Directory> {
    return EMPTY_DIRECTORY
  }

  async clubs(): Promise<Club[]> {
    return [{
      '@id': this.profile.clubId,
      name: null,
      timezone: CLUB_TIMEZONE,
    }]
  }

  // --- Booking ---

  /**
   * Books the member onto a class, or joins its waiting list.
   *
   * One request either way — Gladstone decides based on space. The created
   * place is returned by re-reading the session, so the caller learns which of
   * the two happened from the member's own state on it.
   */
  async book(classEvent: string): Promise<Attendee> {
    const sessionId = sessionIdOf(classEvent)
    await this.get('/api/Book', { sessionId })

    const refreshed = await this.refetchSession(sessionId)
    const attendee = refreshed && toAttendee(refreshed, this.profile.contactId)

    // If the refetch could not place the booking, report a seat rather than
    // failing: the booking itself succeeded, and the next sync corrects the
    // detail. Fall back to the cached event for the class name callers announce.
    return attendee ?? {
      '@id': sessionIri(sessionId),
      contactId: this.profile.contactId,
      state: 'booked',
      classEvent: refreshed ?? this.events.get(sessionIri(sessionId)) ?? null,
      cancelDelayOver: false,
    }
  }

  /** Cancels a booking or gives up a waiting-list place — the same call. */
  async cancel(attendee: string): Promise<void> {
    await this.get('/api/Cancel', { sessionId: sessionIdOf(attendee) })
  }

  /**
   * Re-reads one session by scanning a short window around now for its id.
   *
   * Gladstone has no single-session read, so a booking's result is recovered
   * from the timetable. The booked class is always within the booking window,
   * so the window scanned here is the same one `bookingsFrom` uses.
   */
  private async refetchSession(sessionId: string): Promise<ClassEvent | null> {
    const from = todayClub()
    const raw = await this.get<SessionsResponse>('/api/session', {
      scopeIds: SCOPE_IDS,
      fromUTC: naiveDateToEpoch(from),
      toUTC: naiveDateToEpoch(addNaiveDays(from, BOOKING_WINDOW_DAYS)),
      globalInfo: 1,
    }).catch(() => null)

    if (!raw?.sessions) return null
    const found = raw.sessions.find(session => String(session.id) === sessionId)
    if (!found) return null

    const event = toClassEvent(found)
    this.events.set(event['@id'], event)
    return event
  }
}

/**
 * One authenticated GET against Gladstone.
 *
 * Every request carries the fixed application key and the member's
 * credentials as headers — Gladstone validates them per request, there being
 * no token to hold. Slashes in query values are left literal; Gladstone's ids
 * contain none, but the Resamania client learned to distrust `%2F` and there
 * is no reason to re-encode here.
 */
async function request<T>(
  email: string,
  password: string,
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const query = new URLSearchParams({ locale: 'en_GB' })
  for (const [key, value] of Object.entries(params)) query.append(key, String(value))

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}?${query}`, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        AuthenticationKey: AUTHENTICATION_KEY,
        user: email,
        pw: password,
      },
    })
  } catch (error) {
    throw new ApiError('other', `Request to ${path} failed: ${error}`)
  }

  if (response.status === 401 || response.status === 403) {
    throw ApiError.invalidCredentials()
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new ApiError('other', `Request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  let parsed: T & { responseDocType?: string, errorCode?: string, errorDescription?: string }
  try {
    parsed = (await response.json()) as typeof parsed
  } catch (error) {
    throw new ApiError('other', `Parse error for ${path}: ${error}`)
  }

  // Gladstone answers 200 with an error document rather than an HTTP status for
  // a rejected login, so the body has to be inspected even on success.
  if (parsed.responseDocType === 'ERROR_RESPONSE' && parsed.errorCode === 'INVALID_LOGIN') {
    throw ApiError.invalidCredentials()
  }

  return parsed
}

// --- Small date helpers ---
//
// Local copies so this file does not reach up into `#shared/naive` for more
// than the zone constant and the two primitives it already imports.

/** Today's date in the club's zone, as `YYYY-MM-DD`. */
function todayClub(): NaiveDate {
  return epochToNaive(Math.floor(Date.now() / 1000))!.slice(0, 10)
}

/** Adds whole days to a naive date, through UTC so the zone never bites. */
function addNaiveDays(date: NaiveDate, days: number): NaiveDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(year, month - 1, day))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}
