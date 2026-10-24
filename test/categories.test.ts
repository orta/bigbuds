/** Categorisation of the club's (Gladstone/KAL) class timetable. */

import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_ORDER, lookupClass, matchesQuery } from '#shared/categories'

describe('lookup', () => {
  it('uses the curated table for known classes', () => {
    expect(lookupClass('Body Pump').category).toBe('strength')
    expect(lookupClass('RPM').category).toBe('cycling')
    expect(lookupClass('Body Combat').category).toBe('cardio')
    expect(lookupClass('Vinyasa Yoga').category).toBe('mindBody')
    expect(lookupClass('Aqua Fit').category).toBe('aqua')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(lookupClass('  body pump  ').category).toBe('strength')
    expect(lookupClass('AQUA FIT').category).toBe('aqua')
  })

  it('sees through the club\'s messy spelling and spacing', () => {
    // The same class turns up punctuated and spaced every which way.
    expect(lookupClass('R P M').category).toBe('cycling')
    expect(lookupClass('R.P.M').category).toBe('cycling')
    expect(lookupClass('D E K A').category).toBe('hiit')
    expect(lookupClass('D.E.K.A').category).toBe('hiit')
  })

  it('strips the recurring noise words before matching', () => {
    // "Virtual", "Express" and a level are facts about the class, not the class.
    expect(lookupClass('Virtual R P M Express').category).toBe('cycling')
    expect(lookupClass('Virtual Body Pump').category).toBe('strength')
    expect(lookupClass('Beginners Pilates').category).toBe('mindBody')
    expect(lookupClass('Female Only Aqua Fit').category).toBe('aqua')
  })

  it('keeps the stripped-out facts as tags', () => {
    expect(lookupClass('Virtual R P M').tags).toContain('virtual')
    expect(lookupClass('Les Mills Tone').tags).toContain('les-mills')
    expect(lookupClass('Female Only Pilates').tags).toContain('women-only')
    expect(lookupClass('Body Combat Express').tags).toContain('express')
  })

  it('overrides the broad-brush reading of a name', () => {
    // "Gold" makes it an over-50s class, not just Zumba.
    expect(lookupClass('Zumba Gold').category).toBe('over50s')
    // "Aerotone" contains "tone" but is an aerobics class, not strength.
    expect(lookupClass('Aerotone').category).toBe('cardio')
    // "Next Steps for Cancer" contains "step" but is a gentle rehab class.
    expect(lookupClass('Next Steps for Cancer').category).toBe('over50s')
  })

  it('guesses sensibly for classes added since the table was written', () => {
    expect(lookupClass('Aqua Blast').category).toBe('aqua')
    expect(lookupClass('Spin Express').category).toBe('cycling')
    expect(lookupClass('Restorative Yoga').category).toBe('mindBody')
    expect(lookupClass('Gym Induction').category).toBe('appointments')
    // Nothing matched: lands in the broadest bucket rather than vanishing.
    expect(lookupClass('Something Entirely New').category).toBe('cardio')
  })
})

describe('search', () => {
  it('matches a goal word across differently-named classes', () => {
    // The point of the tag table: "legs" should find more than the class with
    // "legs" in its name.
    expect(matchesQuery('Legs, Bums and Tums', 'legs')).toBe(true)
    expect(matchesQuery('Body Pump', 'legs')).toBe(true)
    expect(matchesQuery('RPM', 'legs')).toBe(true)
    expect(matchesQuery('Hatha Yoga', 'legs')).toBe(false)
  })

  it('matches on name, tag and category alike', () => {
    expect(matchesQuery('Body Pump', 'pump')).toBe(true)
    expect(matchesQuery('Body Pump', 'barbell')).toBe(true)
    expect(matchesQuery('Body Pump', 'strength')).toBe(true)
  })

  it('finds the virtual and Les Mills classes by those words', () => {
    expect(matchesQuery('Virtual R P M', 'virtual')).toBe(true)
    expect(matchesQuery('RPM', 'virtual')).toBe(false)
    expect(matchesQuery('Body Pump', 'les mills')).toBe(true)
  })

  it('narrows rather than widens on multiple words', () => {
    expect(matchesQuery('Beginners Pilates', 'beginner pilates')).toBe(true)
    expect(matchesQuery('The Trip', 'beginner pilates')).toBe(false)
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
