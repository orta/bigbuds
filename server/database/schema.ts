/**
 * The app's own store.
 *
 * Deliberately small: BigBox remains the source of truth for the timetable and
 * for who is booked onto what. This holds only the two things the club's API
 * has no concept of — that a member has joined *this* app, and a snapshot of
 * their upcoming bookings so other members can be shown them without anyone
 * having to hand over their login.
 */

import { boolean, index, integer, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),

  /** IRI, e.g. `/bigbox/contacts/2327536`. The identity BigBox bookings hang off. */
  contactId: text('contact_id').notNull().unique(),
  clubId: text('club_id').notNull().default(''),
  email: text('email').notNull().unique(),
  givenName: text('given_name').notNull().default(''),
  familyName: text('family_name').notNull().default(''),
  /** Human-facing membership number, e.g. `C2327536`. */
  membershipNumber: text('membership_number').notNull().default(''),

  /** AES-256-GCM, see `server/utils/crypto.ts`. Never leaves the server. */
  encryptedPassword: text('encrypted_password').notNull(),

  /**
   * Whether this member appears in other members' planning grids.
   *
   * Defaults to visible: the whole point of the app is seeing who else is
   * going, and a default-private social feature shows an empty room to
   * everyone who arrives. Turning it off hides them everywhere, immediately.
   */
  visible: boolean('visible').notNull().default(true),

  /**
   * Set when the background sync could not sign in as this member — almost
   * always because they changed their BigBox password. Surfaced in the UI as a
   * prompt to sign in again rather than failing silently.
   */
  syncError: text('sync_error'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** IRI, e.g. `/bigbox/class_events/1722803`. */
    classEventId: text('class_event_id').notNull(),

    /** `booked` or `queued` — a waiting-list place is shown differently. */
    state: text('state').notNull(),

    /**
     * The class's naive start time, `2026-08-14T06:30:00`, copied so that
     * pruning past bookings needs no round trip to BigBox. Wall-clock in the
     * club's zone; see `server/utils/naive.ts` for why it stays a string.
     */
    startedAt: text('started_at').notNull(),

    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    // One row per member per class; the sync upserts on this.
    unique('bookings_user_class_unique').on(table.userId, table.classEventId),
    // The "who else is going to these classes" lookup, which every planning
    // page render does once with a few hundred class IRIs.
    index('bookings_class_event_idx').on(table.classEventId),
  ],
)

export type User = typeof users.$inferSelect
export type Booking = typeof bookings.$inferSelect
