/** The strings a member actually reads on a class row. */

import { describe, expect, it } from 'vitest'
import { dayLabel, placesText, queuePositionText, timeRange, whenLabel } from '#shared/format'

describe('timeRange', () => {
  it('shows start and end', () => {
    expect(timeRange('2026-08-14T06:30:00', 45)).toBe('06:30–07:15')
  })

  it('shows just the start when the duration is unknown', () => {
    expect(timeRange('2026-08-14T06:30:00', null)).toBe('06:30')
  })

  it('handles a class running past midnight', () => {
    expect(timeRange('2026-08-14T23:30:00', 60)).toBe('23:30–00:30')
  })

  it('is empty with no start', () => {
    expect(timeRange(null, 45)).toBe('')
  })
})

describe('placesText', () => {
  it('shows free places against capacity', () => {
    expect(placesText({ placesRemaining: 12, capacity: 30 })).toBe('12/30 free')
    expect(placesText({ placesRemaining: 12, capacity: null })).toBe('12 free')
  })

  it('says how many are waiting once it is full', () => {
    // The deciding fact for whether joining the list is worth it.
    expect(placesText({ placesRemaining: 0, capacity: 30, queueCount: 6 }))
      .toBe('Full · 6 waiting')
  })

  it('just says full when nobody is waiting yet', () => {
    expect(placesText({ placesRemaining: 0, capacity: 30, queueCount: 0 })).toBe('Full')
    expect(placesText({ placesRemaining: 0, capacity: 30, queueCount: null })).toBe('Full')
    expect(placesText({ placesRemaining: 0, capacity: 30 })).toBe('Full')
  })

  it('lets cancelled win over everything', () => {
    expect(placesText({ placesRemaining: 12, capacity: 30, isCancelled: true }))
      .toBe('Cancelled')
  })

  it('says nothing when the class reports no capacity', () => {
    expect(placesText({ placesRemaining: null, capacity: null })).toBe('')
  })
})

describe('queuePositionText', () => {
  it('puts the position in the context of the queue', () => {
    expect(queuePositionText(2, 6)).toBe('#2 of 6')
  })

  it('degrades to the position alone when the total is unknown', () => {
    expect(queuePositionText(2, null)).toBe('#2')
  })

  it('reports the queue alone when the position is unknown', () => {
    expect(queuePositionText(null, 6)).toBe('6 waiting')
    expect(queuePositionText(null, null)).toBe('')
  })
})

describe('day labels', () => {
  it('names the weekday from the date itself', () => {
    expect(dayLabel('2026-08-18')).toBe('Tuesday 18 August')
    expect(dayLabel('2026-08-18', 'short')).toBe('Tue 18')
  })

  it('prefers today and tomorrow to a weekday', () => {
    expect(whenLabel('2026-08-18T09:00:00', '2026-08-18', '2026-08-19'))
      .toBe('Today at 09:00')
    expect(whenLabel('2026-08-19T09:00:00', '2026-08-18', '2026-08-19'))
      .toBe('Tomorrow at 09:00')
    expect(whenLabel('2026-08-24T09:00:00', '2026-08-18', '2026-08-19'))
      .toBe('Mon 24 at 09:00')
  })
})
