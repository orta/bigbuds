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
/** Somebody whose gym visits suggest they are usually here around now. */
export interface AroundMember {
  contactId: string
  name: string
  arrived: string
  left: string
  seen: number
}

export interface ClassRow {
  id: string
  /** IRI of the class type, e.g. `/bigbox/activities/2300`. */
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

  /** How many times the viewer has been to this class type before. */
  attendedCount: number
  /** Naive start of the last time they went, when they have. */
  attendedLast: string | null
  /**
   * Members whose usual hours on this weekday cover this class's start.
   *
   * Not the same as `going`: these people are not booked onto the class, they
   * are simply usually at the club around then.
   */
  around: AroundMember[]
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
