import { describe, expect, it } from 'vitest'
import {
  currentNotices,
  noticeSentence,
  noticesFrom,
  withNotice,
  type Notice,
} from '../shared/notices'

const NOW = '2026-08-14T09:00:00'

const notice = (over: Partial<Notice> = {}): Notice => ({
  kind: 'promoted',
  classEventId: '/gs/sessions/1',
  name: 'Body Pump',
  startedAt: '2026-08-14T18:30:00',
  noticedAt: '2026-08-14T09:00:00.000Z',
  seen: false,
  ...over,
})

describe('currentNotices', () => {
  it('drops a notice whose class has been and gone', () => {
    const over = notice({ startedAt: '2026-08-14T06:30:00' })

    expect(currentNotices([over], NOW)).toEqual([])
  })

  it('drops it whether or not it was ever seen', () => {
    const over = notice({ startedAt: '2026-08-14T06:30:00', seen: true })

    expect(currentNotices([over], NOW)).toEqual([])
  })

  it('keeps one whose class is still to come', () => {
    expect(currentNotices([notice()], NOW)).toHaveLength(1)
  })

  it('puts the soonest class first', () => {
    const later = notice({ classEventId: '/b', startedAt: '2026-08-16T10:00:00' })
    const sooner = notice({ classEventId: '/a', startedAt: '2026-08-14T18:30:00' })

    expect(currentNotices([later, sooner], NOW).map(n => n.classEventId)).toEqual(['/a', '/b'])
  })
})

describe('withNotice', () => {
  it('adds a notice about a class with none', () => {
    const added = notice({ classEventId: '/b', startedAt: '2026-08-15T09:00:00' })

    expect(withNotice([notice()], added, NOW)).toHaveLength(2)
  })

  /**
   * Somebody booking a member in and then thinking better of it must not leave
   * the banner arguing with itself about whether they have a class.
   */
  it('replaces an earlier notice about the same class', () => {
    const booked = notice({ kind: 'booked-for-you', by: 'Sam' })
    const cancelled = notice({ kind: 'cancelled-for-you', by: 'Sam' })

    const held = withNotice(withNotice([], booked, NOW), cancelled, NOW)

    expect(held).toHaveLength(1)
    expect(held[0]!.kind).toBe('cancelled-for-you')
  })

  it('leaves notices about other classes alone when it replaces one', () => {
    const other = notice({ classEventId: '/b', startedAt: '2026-08-15T09:00:00' })
    const replacement = notice({ kind: 'cancelled-for-you', by: 'Sam' })

    const held = withNotice([notice(), other], replacement, NOW)

    expect(held.map(n => n.classEventId)).toEqual(['/gs/sessions/1', '/b'])
    expect(held[0]!.kind).toBe('cancelled-for-you')
  })

  it('prunes the finished ones while it is there', () => {
    const over = notice({ classEventId: '/old', startedAt: '2026-08-14T06:30:00' })
    const added = notice({ classEventId: '/b', startedAt: '2026-08-15T09:00:00' })

    expect(withNotice([over], added, NOW).map(n => n.classEventId)).toEqual(['/b'])
  })
})

describe('noticeSentence', () => {
  it('says a promotion without attributing it to a person', () => {
    const { title, body } = noticeSentence(notice(), 'Today at 18:30')

    expect(title).toBe('You are in — Body Pump')
    expect(body).toBe('A place came up for Today at 18:30.')
    // The club's automation is not somebody who made a decision about them.
    expect(title + body).not.toMatch(/undefined/)
  })

  it('names who booked them in', () => {
    const { title, body } = noticeSentence(
      notice({ kind: 'booked-for-you', by: 'Sam Ross' }),
      'Tomorrow at 06:30',
    )

    expect(title).toBe('Sam Ross booked you in')
    expect(body).toBe('Body Pump, Tomorrow at 06:30.')
  })

  it('names who cancelled for them', () => {
    const { title } = noticeSentence(
      notice({ kind: 'cancelled-for-you', by: 'Sam Ross' }),
      'Tomorrow at 06:30',
    )

    expect(title).toBe('Sam Ross cancelled a class for you')
  })

  it('says a space opened without claiming the member has it', () => {
    const { title, body } = noticeSentence(notice({ kind: 'space-available' }), 'Tomorrow at 09:30')

    expect(title).toBe('A space opened — Body Pump')
    expect(body).toBe('Tomorrow at 09:30. It goes to whoever books first.')
  })
})

describe('noticesFrom', () => {
  it('reads a record written since notices existed', () => {
    expect(noticesFrom({ notices: [notice()] })).toHaveLength(1)
  })

  /**
   * The version that shipped first stored `promotions` and nothing else. A
   * member promoted in that window must not lose the notice on upgrade.
   */
  it('converts the promotions a previous version wrote', () => {
    const converted = noticesFrom({
      promotions: [{
        classEventId: '/gs/sessions/1',
        name: 'Body Pump',
        startedAt: '2026-08-14T18:30:00',
        noticedAt: '2026-08-14T09:00:00.000Z',
        seen: false,
      }],
    })

    expect(converted).toEqual([{
      kind: 'promoted',
      classEventId: '/gs/sessions/1',
      name: 'Body Pump',
      startedAt: '2026-08-14T18:30:00',
      noticedAt: '2026-08-14T09:00:00.000Z',
      seen: false,
    }])
  })

  it('prefers notices when a record somehow carries both', () => {
    const held = noticesFrom({
      notices: [notice({ kind: 'booked-for-you', by: 'Sam' })],
      promotions: [{
        classEventId: '/old',
        name: 'Stale',
        startedAt: '2026-08-14T18:30:00',
        noticedAt: '2026-08-14T09:00:00.000Z',
        seen: false,
      }],
    })

    expect(held.map(n => n.kind)).toEqual(['booked-for-you'])
  })

  it('has nothing to say about a record predating both', () => {
    expect(noticesFrom({})).toEqual([])
  })
})
