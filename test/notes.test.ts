import { describe, expect, it } from 'vitest'
import { isActivityId, noteCounts } from '../server/utils/notes'
import type { Member } from '../server/utils/store'

const member = (notes: Record<string, string>): Member => ({
  notes: Object.fromEntries(
    Object.entries(notes).map(([id, text]) => [id, { text, updatedAt: '2026-08-01T09:00:00Z' }]),
  ),
} as unknown as Member)

describe('isActivityId', () => {
  it('accepts the ids the app derives from class titles', () => {
    expect(isActivityId('/gs/activities/strength-development')).toBe(true)
    expect(isActivityId('/gs/activities/body-pump-45')).toBe(true)
  })

  it.each([
    ['a bare id', '2300'],
    ['a different collection', '/gs/sessions/80300672'],
    ['a traversal', '/gs/activities/../../etc/passwd'],
    ['a prototype key', '__proto__'],
    ['a slug with capitals or spaces', '/gs/activities/Body Pump'],
    ['nothing at all', ''],
  ])('rejects %s', (_, value) => {
    expect(isActivityId(value)).toBe(false)
  })
})

describe('noteCounts', () => {
  it('counts one note per member per class type', () => {
    const counts = noteCounts([
      member({ '/gs/activities/body-pump': 'Bring grip socks' }),
      member({ '/gs/activities/body-pump': 'Harder than it sounds' }),
      member({ '/gs/activities/yoga': 'Lovely' }),
    ])

    expect(counts).toEqual({ '/gs/activities/body-pump': 2, '/gs/activities/yoga': 1 })
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
