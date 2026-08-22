import { describe, expect, it } from 'vitest'
import { isActivityId, noteCounts } from '../server/utils/notes'
import type { Member } from '../server/utils/store'

const member = (notes: Record<string, string>): Member => ({
  notes: Object.fromEntries(
    Object.entries(notes).map(([id, text]) => [id, { text, updatedAt: '2026-08-01T09:00:00Z' }]),
  ),
} as unknown as Member)

describe('isActivityId', () => {
  it('accepts the IRIs the club actually sends', () => {
    expect(isActivityId('/bigbox/activities/2300')).toBe(true)
  })

  it.each([
    ['a bare id', '2300'],
    ['a different collection', '/bigbox/class_events/1722803'],
    ['a traversal', '/bigbox/activities/../../etc/passwd'],
    ['a prototype key', '__proto__'],
    ['nothing at all', ''],
  ])('rejects %s', (_, value) => {
    expect(isActivityId(value)).toBe(false)
  })
})

describe('noteCounts', () => {
  it('counts one note per member per class type', () => {
    const counts = noteCounts([
      member({ '/bigbox/activities/1': 'Bring grip socks' }),
      member({ '/bigbox/activities/1': 'Harder than it sounds' }),
      member({ '/bigbox/activities/2': 'Lovely' }),
    ])

    expect(counts).toEqual({ '/bigbox/activities/1': 2, '/bigbox/activities/2': 1 })
  })

  it('has nothing to say about a class nobody has written about', () => {
    expect(noteCounts([member({})])).toEqual({})
    expect(noteCounts([])).toEqual({})
  })

  /** Records predating notes have no `notes` key at all. */
  it('tolerates a member written before notes existed', () => {
    expect(noteCounts([{} as Member])).toEqual({})
  })
})
