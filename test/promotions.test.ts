import { describe, expect, it } from 'vitest'
import { detectPromotions, type BookingSnapshot } from '../shared/promotions'

const NOW = '2026-08-14T09:00:00'

const booking = (
  id: string,
  state: string,
  startedAt: string,
  name = 'Body Pump',
): BookingSnapshot => ({ classEventId: id, state, startedAt, name })

describe('detectPromotions', () => {
  it('reports a waiting-list place that became a booking', () => {
    const before = [booking('/bigbox/class_events/1', 'queued', '2026-08-14T18:30:00')]
    const after = [booking('/bigbox/class_events/1', 'booked', '2026-08-14T18:30:00')]

    expect(detectPromotions(before, after, NOW)).toEqual([{
      classEventId: '/bigbox/class_events/1',
      name: 'Body Pump',
      startedAt: '2026-08-14T18:30:00',
    }])
  })

  it('says nothing when a member books a class themselves', () => {
    // Absent, then booked. They pressed the button.
    const after = [booking('/bigbox/class_events/1', 'booked', '2026-08-14T18:30:00')]

    expect(detectPromotions([], after, NOW)).toEqual([])
  })

  it('says nothing when a member joins a waiting list', () => {
    const after = [booking('/bigbox/class_events/1', 'queued', '2026-08-14T18:30:00')]

    expect(detectPromotions([], after, NOW)).toEqual([])
  })

  it('says nothing while the member is still waiting', () => {
    const before = [booking('/bigbox/class_events/1', 'queued', '2026-08-14T18:30:00')]

    expect(detectPromotions(before, before, NOW)).toEqual([])
  })

  it('does not re-report a promotion it has already seen', () => {
    const booked = [booking('/bigbox/class_events/1', 'booked', '2026-08-14T18:30:00')]

    // The sync after the one that noticed: both snapshots say booked.
    expect(detectPromotions(booked, booked, NOW)).toEqual([])
  })

  /**
   * The sync fetches from the club's midnight, so a mid-morning run still sees
   * this morning's classes. Being told at 09:00 that a place opened up for an
   * 06:30 is worse than being told nothing.
   */
  it('leaves out a class that has already started', () => {
    const before = [booking('/bigbox/class_events/1', 'queued', '2026-08-14T06:30:00')]
    const after = [booking('/bigbox/class_events/1', 'booked', '2026-08-14T06:30:00')]

    expect(detectPromotions(before, after, NOW)).toEqual([])
  })

  it('reports each promotion when two land in the same sync', () => {
    const before = [
      booking('/bigbox/class_events/1', 'queued', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/bigbox/class_events/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
    ]
    const after = [
      booking('/bigbox/class_events/1', 'booked', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/bigbox/class_events/2', 'booked', '2026-08-15T09:00:00', 'Reformer'),
    ]

    expect(detectPromotions(before, after, NOW).map(p => p.name)).toEqual(['Body Pump', 'Reformer'])
  })

  it('leaves the others alone when only one of several is promoted', () => {
    const before = [
      booking('/bigbox/class_events/1', 'queued', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/bigbox/class_events/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
      booking('/bigbox/class_events/3', 'booked', '2026-08-16T10:00:00', 'Spin'),
    ]
    const after = [
      booking('/bigbox/class_events/1', 'booked', '2026-08-14T18:30:00', 'Body Pump'),
      booking('/bigbox/class_events/2', 'queued', '2026-08-15T09:00:00', 'Reformer'),
      booking('/bigbox/class_events/3', 'booked', '2026-08-16T10:00:00', 'Spin'),
    ]

    expect(detectPromotions(before, after, NOW).map(p => p.name)).toEqual(['Body Pump'])
  })

  /**
   * Snapshots written before the class name was stored still have to promote
   * correctly — they just cannot say which class until the next sync.
   */
  it('falls back to a generic name on a snapshot that predates names', () => {
    const before = [{
      classEventId: '/bigbox/class_events/1',
      state: 'queued',
      startedAt: '2026-08-14T18:30:00',
    }]
    const after = [{
      classEventId: '/bigbox/class_events/1',
      state: 'booked',
      startedAt: '2026-08-14T18:30:00',
    }]

    expect(detectPromotions(before, after, NOW)[0]?.name).toBe('your class')
  })
})
