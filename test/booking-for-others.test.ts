/**
 * Who may book whom.
 *
 * This is the only rule in the app where getting it wrong lets one member act
 * on another's account, so it is tested from both directions: that a grant
 * works, and that everything short of an explicit, mutual-free, current grant
 * does not.
 */

import { describe, expect, it } from 'vitest'
import { buddiesFor, mayBookFor } from '../server/utils/members'
import type { Member } from '../server/utils/store'

const ME = '/gs/contacts/1'
const WIFE = '/gs/contacts/2'
const STRANGER = '/gs/contacts/3'

const member = (contactId: string, over: Partial<Member> = {}): Member => ({
  contactId,
  clubId: '/gs/sites/CVLC',
  email: `${contactId}@example.com`,
  givenName: 'Sam',
  familyName: contactId.slice(-1),
  membershipNumber: 'C1',
  encryptedPassword: '',
  visible: true,
  shareEntries: true,
  bookableBy: [],
  hiddenCategories: [],
  hideFinished: false,
  syncError: null,
  lastSyncedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  bookings: [],
  entries: [],
  attended: {},
  attendedSyncedAt: null,
  ...over,
})

describe('permission', () => {
  it('is granted by the person being booked, not the one booking', () => {
    const me = member(ME, { bookableBy: [WIFE] })

    // My wife may book me, because I said so.
    expect(mayBookFor(me, WIFE)).toBe(true)
    // That says nothing about whether I may book her.
    expect(mayBookFor(member(WIFE), ME)).toBe(false)
  })

  it('is off until somebody says otherwise', () => {
    expect(mayBookFor(member(ME), WIFE)).toBe(false)
    expect(mayBookFor(member(ME, { bookableBy: [WIFE] }), STRANGER)).toBe(false)
  })

  /**
   * A member is not their own buddy. Booking your own class goes down the
   * ordinary path, and a self-grant that satisfied this would make a bug in
   * the grant list indistinguishable from booking yourself in.
   */
  it('never resolves to the member themselves', () => {
    expect(mayBookFor(member(ME, { bookableBy: [ME] }), ME)).toBe(false)
  })

  /** Records written before the field existed have no grants, not undefined. */
  it('treats a record with no list as having granted nobody', () => {
    const legacy = { contactId: ME } as Member
    expect(mayBookFor(legacy, WIFE)).toBe(false)
  })
})

describe('the people you can book for', () => {
  const members = [
    member(ME, { bookableBy: [WIFE] }),
    member(WIFE, { givenName: 'Wanda', bookableBy: [ME], bookings: [
      { classEventId: '/gs/sessions/9', state: 'booked', startedAt: '2026-08-21T06:30:00' },
    ] }),
    member(STRANGER, { givenName: 'Nia' }),
  ]

  it('is drawn from who granted the viewer, with what they already hold', () => {
    const buddies = buddiesFor(members, ME)

    expect(buddies.map(buddy => buddy.contactId)).toEqual([WIFE])
    expect(buddies[0]!.bookings).toHaveLength(1)
    expect(buddies[0]!.name).toBe('Wanda 2')
  })

  it('excludes everyone who has not granted the viewer', () => {
    expect(buddiesFor(members, STRANGER)).toEqual([])
  })

  /**
   * Hiding your classes and asking somebody to book them are separate
   * choices: a member who has made both still needs their buddy to act.
   */
  it('keeps somebody who has hidden their classes', () => {
    const hidden = [member(WIFE, { visible: false, bookableBy: [ME] })]
    expect(buddiesFor(hidden, ME).map(buddy => buddy.contactId)).toEqual([WIFE])
  })
})
