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

/** Somebody the viewer may book onto classes, because they asked. */
export interface BookingBuddy {
  contactId: string
  name: string
}

/** One of those people, already holding a place at a particular class. */
export interface BookedFor extends BookingBuddy {
  /** `booked` or `queued`. */
  state: string
}

/** Another member's note about a class type. */
export interface ClassNote {
  contactId: string
  name: string
  text: string
  /** ISO instant. */
  updatedAt: string
}

/**
 * Everything shown under a class's description.
 *
 * The viewer's own note is separated from everyone else's rather than flagged
 * within one list, because it is the only one they can act on: theirs is a
 * text box with their words already in it, and the rest are things other
 * people wrote. One list with an "edit" affordance on exactly one row is the
 * same information arranged so the reader has to find it.
 */
export interface ClassNotes {
  /** The viewer's own note, or null if they have not written one. */
  yours: string | null
  others: ClassNote[]
}

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
  /** IRI of the class type, e.g. `/gs/activities/strength-development`. */
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
  /** Whether a waiting-list place is set to be booked as soon as a space opens. */
  autoAccept: boolean

  category: Category
  categoryLabel: string
  tags: string[]
  /** The class has already started. */
  finished: boolean

  going: AlsoGoing[]

  /**
   * Which of the people the viewer can book for are already on this class.
   *
   * Separate from `going`, which is about who the viewer can *see*: these two
   * lists overlap for a visible buddy and diverge for a hidden one, and only
   * this one decides whether the row offers to book them or to cancel.
   */
  bookedFor: BookedFor[]

  /**
   * How many notes members have left about this class type.
   *
   * A count rather than the notes themselves: a day holds sixty-odd classes
   * and almost none of them are open, so sending every note with the timetable
   * would be paying for the whole feature on every page load. The count is
   * what makes it discoverable — a class name with nothing behind it looks the
   * same as one with four people's advice behind it.
   */
  noteCount: number

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
  /** Whether they have let the viewer book them onto classes. */
  youCanBook: boolean
  /** Whether the viewer has let them do the same. */
  canBookYou: boolean
}
