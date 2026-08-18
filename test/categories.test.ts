/** Ported from the Rust `categories` tests. */

import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_ORDER, lookupClass, matchesQuery } from '#shared/categories'

describe('lookup', () => {
  it('uses the curated table for known classes', () => {
    expect(lookupClass('Body Pump').category).toBe('strength')
    expect(lookupClass('HYROX').category).toBe('hiit')
    expect(lookupClass('Vinyasa Yoga').category).toBe('mindBody')
    expect(lookupClass('EMS Session').category).toBe('ems')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(lookupClass('  body pump  ').category).toBe('strength')
    expect(lookupClass('AQUA PILATES').category).toBe('aqua')
  })

  it('overrides the API\'s own miscategorisations', () => {
    // The API files these under Dance and Aqua respectively.
    expect(lookupClass('Beginners Hyrox').category).toBe('hiit')
    expect(lookupClass('Zumba Gold').category).toBe('over50s')
  })

  it('guesses sensibly for classes added since the table was written', () => {
    expect(lookupClass('Aqua Blast').category).toBe('aqua')
    expect(lookupClass('Advanced Hyrox Skills').category).toBe('hiit')
    expect(lookupClass('Restorative Yoga').category).toBe('mindBody')
    expect(lookupClass('Kettlebell Induction').category).toBe('appointments')
    // Nothing matched: lands in the broadest bucket rather than vanishing.
    expect(lookupClass('Something Entirely New').category).toBe('cardio')
  })

  it('checks the most specific keyword first', () => {
    // Contains both "reformer" and "pilates"; reformer is the narrower answer.
    expect(lookupClass('Reformer Flow').category).toBe('reformer')
    // Contains "taster", which means an appointment whatever it is for.
    expect(lookupClass('Reformer Taster').category).toBe('reformer')
  })
})

describe('search', () => {
  it('matches a goal word across differently-named classes', () => {
    // The point of the tag table: "legs" should find more than the class
    // with "legs" in its name.
    expect(matchesQuery('Legs, Bums and Tums', 'legs')).toBe(true)
    expect(matchesQuery('Body Pump', 'legs')).toBe(true)
    expect(matchesQuery('Spin', 'legs')).toBe(true)
    expect(matchesQuery('Hatha Yoga', 'legs')).toBe(false)
  })

  it('matches on name, tag and category alike', () => {
    expect(matchesQuery('Body Pump', 'pump')).toBe(true)
    expect(matchesQuery('Body Pump', 'barbell')).toBe(true)
    expect(matchesQuery('Body Pump', 'strength')).toBe(true)
  })

  it('narrows rather than widens on multiple words', () => {
    expect(matchesQuery('Beginners Pilates', 'beginner pilates')).toBe(true)
    expect(matchesQuery('Advanced Reformer', 'beginner pilates')).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(matchesQuery('Body Pump', '')).toBe(true)
    expect(matchesQuery('Body Pump', '   ')).toBe(true)
  })

  it('ignores case', () => {
    expect(matchesQuery('Body Pump', 'STRENGTH')).toBe(true)
  })
})

describe('category table', () => {
  it('describes every category it lists', () => {
    expect(CATEGORY_ORDER).toHaveLength(Object.keys(CATEGORIES).length)

    for (const category of CATEGORY_ORDER) {
      const info = CATEGORIES[category]
      expect(info.label.length).toBeGreaterThan(0)
      expect(info.description.length).toBeGreaterThan(0)
      expect(info.aliases.length).toBeGreaterThan(0)
      expect(info.icon).toMatch(/^i-/)
    }
  })

  it('puts appointments last, since they are not group classes', () => {
    expect(CATEGORY_ORDER.at(-1)).toBe('appointments')
  })
})
