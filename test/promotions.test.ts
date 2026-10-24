import { describe, expect, it } from 'vitest'
import { detectOpenings, detectPromotions, hasOpening, type BookingSnapshot } from '../shared/promotions'

const NOW = '2026-08-14T09:00:00'

const booking = (
  id: string,
  state: string,
  startedAt: string,
  name = 'Body Pump',
): BookingSnapshot => ({ classEventId: id, state, startedAt, name })

describe('detectPromotions', () => {
  it('reports a waiting-list place that became a booking', () => {
    const before = [booking('/gs/sessions/1', 'queued', '2026-08-14T18:30:00')]
    const after = [booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00')]

    expect(detectPromotions(before, after, NOW)).toEqual([{
      classEventId: '/gs/sessions/1',
      name: 'Body Pump',
      startedAt: '2026-08-14T18:30:00',
    }])
  })

  it('says nothing when a member books a class themselves', () => {
    // Absent, then booked. They pressed the button.
    const after = [booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00')]

    expect(detectPromotions([], after, NOW)).toEqual([])
  })

  it('says nothing when a member joins a waiting list', () => {
    const after = [booking('/gs/sessions/1', 'queued', '2026-08-14T18:30:00')]

    expect(detectPromotions([], after, NOW)).toEqual([])
  })

  it('says nothing while the member is still waiting', () => {
    const before = [booking('/gs/sessions/1', 'queued', '2026-08-14T18:30:00')]

    expect(detectPromotions(before, before, NOW)).toEqual([])
  })

  it('does not re-report a promotion it has already seen', () => {
    const booked = [booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00')]

    // The sync after the one that noticed: both snapshots say booked.
    expect(detectPromotions(booked, booked, NOW)).toEqual([])
  })

  /**
   * The sync fetches from the club's midnight, so a mid-morning run still sees
   * this morning's classes. Being told at 09:00 that a place opened up for an
   * 06:30 is worse than being told nothing.
   */
  it('leaves out a class that has already started', () => {
    const before = [booking('/gs/sessions/1', 'queued', '2026-08-14T06:30:00')]
    const after = [booking('/gs/sessions/1', 'booked', '2026-08-14T06:30:00')]

    expect(detectPromotions(before, after, NOW)).toEqual([])
  })

  it('reports each promotion when two land in the same sync', () => {
    const before = [
      booking('/gs/sessions/1', 'queued', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/gs/sessions/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
    ]
    const after = [
      booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/gs/sessions/2', 'booked', '2026-08-15T09:00:00', 'Reformer'),
    ]

    expect(detectPromotions(before, after, NOW).map(p => p.name)).toEqual(['Body Pump', 'Reformer'])
  })

  it('leaves the others alone when only one of several is promoted', () => {
    const before = [
      booking('/gs/sessions/1', 'queued', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/gs/sessions/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
      booking('/gs/sessions/3', 'booked', '2026-08-16T10:00:00', 'Spin'),
    ]
    const after = [
      booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/gs/sessions/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
      booking('/gs/sessions/3', 'booked', '2026-08-16T10:00:00', 'Spin'),
    ]

    expect(detectPromotions(before, after, NOW).map(p => p.name)).toEqual(['Body Pump'])
  })

  /**
   * Snapshots written before the class name was stored still have to promote
   * correctly — they just cannot say which class until the next sync.
   */
  it('falls back to a generic name on a snapshot that predates names', () => {
    const before = [{
      classEventId: '/gs/sessions/1',
      state: 'queued',
      startedAt: '2026-08-14T18:30:00',
    }]
    const after = [{
      classEventId: '/gs/sessions/1',
      state: 'booked',
      startedAt: '2026-08-14T18:30:00',
    }]

    expect(detectPromotions(before, after, NOW)[0]?.name).toBe('your class')
  })
})

const waiting = (spaces: number | undefined, startedAt = '2026-08-14T18:30:00'): BookingSnapshot =>
  ({ ...booking('/gs/sessions/1', 'queued', startedAt), spaces })

describe('detectOpenings', () => {
  it('reports a space opening at a class the member is waiting for', () => {
    expect(detectOpenings([waiting(0)], [waiting(1)], NOW)).toEqual([{
      classEventId: '/gs/sessions/1',
      name: 'Body Pump',
      startedAt: '2026-08-14T18:30:00',
    }])
  })

  it('says nothing while the class stays full', () => {
    expect(detectOpenings([waiting(0)], [waiting(0)], NOW)).toEqual([])
  })

  it('does not re-report a space that is still open on the next sync', () => {
    expect(detectOpenings([waiting(1)], [waiting(2)], NOW)).toEqual([])
  })

  it('reports a space that closed and then opened again', () => {
    const closed = detectOpenings([waiting(1)], [waiting(0)], NOW)
    const reopened = detectOpenings([waiting(0)], [waiting(1)], NOW)

    expect(closed).toEqual([])
    expect(reopened).toHaveLength(1)
  })

  it('says nothing when a member joins a waiting list that has a space', () => {
    expect(detectOpenings([], [waiting(1)], NOW)).toEqual([])
  })

  /** The first sync after `spaces` was stored must not announce every open class. */
  it('treats a snapshot without spaces as unknown, not as full', () => {
    expect(detectOpenings([waiting(undefined)], [waiting(1)], NOW)).toEqual([])
  })

  it('says nothing once the member has booked the space', () => {
    const booked = { ...booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00'), spaces: 0 }

    expect(detectOpenings([waiting(0)], [booked], NOW)).toEqual([])
  })

  it('leaves out a class that has already started', () => {
    expect(detectOpenings([waiting(0, '2026-08-14T06:30:00')], [waiting(1, '2026-08-14T06:30:00')], NOW))
      .toEqual([])
  })
})

describe('hasOpening', () => {
  it('is true only for a waiting-list place at a class with room', () => {
    expect(hasOpening(waiting(1))).toBe(true)
    expect(hasOpening(waiting(0))).toBe(false)
    expect(hasOpening(waiting(undefined))).toBe(false)
    expect(hasOpening({ ...booking('/gs/sessions/1', 'booked', '2026-08-14T18:30:00'), spaces: 3 })).toBe(false)
  })
})
