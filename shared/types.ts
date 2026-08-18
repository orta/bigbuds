/**
 * The shapes the API sends the browser.
 *
 * Declared here rather than inferred from the route handlers so that a
 * component's props are readable on their own, and so a change to what the
 * server returns is a type error in the component that consumes it.
 */

import type { Category } from './categories'
import type { Naive } from './naive'

/** Another member going to the same class. */
export interface AlsoGoing {
  contactId: string
  name: string
  /** `booked` or `queued` — a waiting-list place is not a promise to be there. */
  state: string
}

/** One class on the timetable, resolved and merged with who else is going. */
export interface ClassRow {
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
  /** The cap on the waiting list. */
  queueLimit: number | null
  isCancelled: boolean
  description: string | null

  /** Whether the viewer holds an actual seat. */
  booked: boolean
  /** Whether the viewer is on the waiting list instead. */
  queued: boolean
  queuePosition: number | null
  /** The viewer's attendee IRI, for cancelling. */
  attendeeId: string | null
  /** False once the club's cancellation deadline has passed. Only sent for bookings. */
  cancellable?: boolean

  category: Category
  categoryLabel: string
  tags: string[]
  /** The class has already started. */
  finished: boolean

  going: AlsoGoing[]
}

export interface MemberRow {
  contactId: string
  name: string
  isYou: boolean
  /** Count of upcoming booked classes. */
  upcoming: number
  /** Naive start of their next class, if any. */
  next: string | null
}
