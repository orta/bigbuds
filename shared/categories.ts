/**
 * Curated categories and tags for the club's class timetable.
 *
 * Gladstone exposes an activity group per class (it is all one group, `FITC`
 * "Fitness Classes"), which is far too coarse to browse by — nearly the whole
 * timetable lands in it. So the browseable grouping is maintained here instead,
 * derived from each class's name and its description in the member API.
 *
 * Every class gets exactly one `Category`, which is what the planning view
 * groups by, plus any number of free-form tags, which is what search matches
 * on. Tags are the goal- and body-part words a member would actually type —
 * `legs`, `strength`, `weights`, `core` — and deliberately overlap.
 *
 * The club's names are *messy*: the same class turns up as `R P M`, `Rpm`,
 * `R.P.M` and `Virtual R P M Express`, and a third of the timetable is virtual
 * (unstaffed, played on a screen). So matching does not rely on exact names —
 * it strips the recurring noise words (`virtual`, `les mills`, `express`,
 * `beginners`, `female only`, …) and the punctuation, then matches what is
 * left, falling back to keywords for anything uncurated. The stripped-out
 * facts come back as tags (`virtual`, `les-mills`, `women-only`, …) so they
 * stay searchable without a table row per variant.
 *
 * This lives in `shared/` because both the server (grouping the planning
 * response) and the client (filtering as you type) need it.
 */

export type Category =
  | 'cardio'
  | 'cycling'
  | 'strength'
  | 'hiit'
  | 'dance'
  | 'mindBody'
  | 'aqua'
  | 'over50s'
  | 'kids'
  | 'appointments'

export interface CategoryInfo {
  label: string
  /** A one-line explainer shown under the heading in the planning view. */
  description: string
  /** Words that should surface this category in search, beyond its label. */
  aliases: string[]
  /** Icon shown beside the heading. */
  icon: string
}

/**
 * Display order for the grouped view. Roughly "most people are here for this"
 * first, with one-to-one appointments last.
 */
export const CATEGORIES: Record<Category, CategoryInfo> = {
  cardio: {
    label: 'Cardio',
    description: 'Heart-rate and endurance work — Les Mills Attack, Combat, Step and aerobics.',
    aliases: ['cardio', 'fitness', 'aerobics', 'combat', 'attack', 'step'],
    icon: 'i-lucide-heart-pulse',
  },
  cycling: {
    label: 'Indoor Cycling',
    description: 'On the bikes — RPM, Sprint, The Trip and studio cycling, from a gentle ride to a sprint.',
    aliases: ['cycling', 'bike', 'spin', 'rpm', 'sprint', 'trip'],
    icon: 'i-lucide-bike',
  },
  strength: {
    label: 'Strength & Weights',
    description: 'Barbells, dumbbells and bodyweight — building muscle and tone.',
    aliases: ['strength', 'weights', 'lifting', 'toning', 'pump'],
    icon: 'i-lucide-dumbbell',
  },
  hiit: {
    label: 'HIIT & Conditioning',
    description: 'Circuits and intervals: short hard efforts with brief recovery — Grit, DEKA and bootcamps.',
    aliases: ['hiit', 'conditioning', 'circuit', 'bootcamp', 'grit', 'deka'],
    icon: 'i-lucide-flame',
  },
  dance: {
    label: 'Dance',
    description: 'Choreographed routines set to music. No experience needed.',
    aliases: ['dance', 'dancing', 'zumba', 'clubbercise'],
    icon: 'i-lucide-music',
  },
  mindBody: {
    label: 'Mind & Body',
    description: 'Yoga, Pilates, barre, stretching and tai chi — flexibility, balance and calm.',
    aliases: ['mind', 'body', 'wellness', 'relax', 'yoga', 'pilates', 'barre'],
    icon: 'i-lucide-flower-2',
  },
  aqua: {
    label: 'Aqua',
    description:
      'In the pool. The water supports your joints while adding resistance, so it is '
      + 'low impact but still hard work. No swimming ability needed.',
    aliases: ['aqua', 'water', 'pool', 'swimming', 'swimfit'],
    icon: 'i-lucide-waves',
  },
  over50s: {
    label: 'Gentle & Over 50s',
    description: 'Slower paced and lower impact — chair-based, mobility, and supported-exercise classes.',
    aliases: ['over 50s', 'seniors', 'mature', 'gentle', 'chair', 'low impact'],
    icon: 'i-lucide-sun',
  },
  kids: {
    label: 'Kids & Family',
    description: 'For children, teenagers and families training together.',
    aliases: ['kids', 'family', 'children', 'teens', 'junior'],
    icon: 'i-lucide-baby',
  },
  appointments: {
    label: 'Inductions & Check-ups',
    description:
      'One-to-one inductions and assessments rather than group classes — book these to '
      + 'get set up on the gym equipment.',
    aliases: ['induction', 'check-up', 'appointment', 'assessment', 'taster'],
    icon: 'i-lucide-clipboard-check',
  },
}

/** Category display order. */
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[]

export interface ClassInfo {
  category: Category
  tags: string[]
}

/**
 * Curated from the club's live timetable and each class's description.
 *
 * Keyed by a *canonical* name. Lookup is not exact: both the key and the class
 * being looked up are normalised the same way — lower-cased, with the recurring
 * noise words and all punctuation stripped — so `R P M`, `Rpm`, `R.P.M` and
 * `Virtual R P M Express` all resolve to the `RPM` row. Cross-cutting facts
 * (virtual, Les Mills, women-only, express, level) are added as tags
 * afterwards rather than duplicated into a row each.
 */
const CLASSES: Record<string, [Category, string[]]> = {
  // --- Cardio ---
  'Body Attack': ['cardio', ['cardio', 'hiit', 'athletic', 'functional', 'les-mills', 'full-body']],
  'Body Combat': ['cardio', ['martial-arts', 'boxing', 'cardio', 'hiit', 'les-mills', 'full-body', 'fat-burn']],
  'Body Step': ['cardio', ['step', 'aerobics', 'cardio', 'les-mills', 'legs', 'coordination']],
  'Step': ['cardio', ['step', 'aerobics', 'cardio', 'legs', 'coordination']],
  'Step and Shape': ['cardio', ['step', 'aerobics', 'cardio', 'toning', 'legs']],
  'Aerotone': ['cardio', ['aerobics', 'toning', 'cardio', 'weights', 'coordination']],

  // --- Indoor cycling ---
  'RPM': ['cycling', ['cycling', 'cardio', 'legs', 'les-mills', 'endurance', 'fat-burn']],
  'Sprint': ['cycling', ['cycling', 'hiit', 'cardio', 'legs', 'les-mills', 'intervals']],
  'The Trip': ['cycling', ['cycling', 'cardio', 'immersive', 'les-mills', 'endurance']],
  'Studio Cycling': ['cycling', ['cycling', 'cardio', 'legs', 'endurance']],
  'Active Cycling': ['cycling', ['cycling', 'cardio', 'legs', 'endurance']],
  'HIIT Cycle': ['cycling', ['cycling', 'hiit', 'cardio', 'legs', 'intervals']],

  // --- Strength & weights ---
  'Body Pump': ['strength', ['strength', 'weights', 'barbell', 'toning', 'les-mills', 'full-body', 'core', 'legs']],
  'Les Mills Tone': ['strength', ['strength', 'toning', 'weights', 'cardio', 'les-mills', 'full-body']],
  'Les Mills Core': ['strength', ['core', 'abs', 'strength', 'stability', 'les-mills']],
  'Grit Strength': ['strength', ['strength', 'hiit', 'weights', 'les-mills', 'full-body']],
  'KAL Strength': ['strength', ['strength', 'weights', 'barbell', 'full-body']],
  'Studio Strength': ['strength', ['strength', 'weights', 'full-body']],
  'Active Tone': ['strength', ['strength', 'toning', 'weights', 'barbell', 'core']],
  'Active Resistance': ['strength', ['strength', 'resistance', 'core', 'weights', 'bands']],
  'Active Abs': ['strength', ['core', 'abs', 'strength', 'stability']],
  'Kettlebells': ['strength', ['strength', 'kettlebell', 'functional', 'full-body']],
  'LBT': ['strength', ['legs', 'glutes', 'core', 'toning', 'lower-body', 'strength']],
  'Legs Bums and Tums': ['strength', ['legs', 'glutes', 'core', 'toning', 'lower-body', 'strength']],

  // --- HIIT & conditioning ---
  'Grit Cardio': ['hiit', ['hiit', 'cardio', 'les-mills', 'intervals', 'full-body']],
  'Grit Series': ['hiit', ['hiit', 'les-mills', 'intervals', 'strength', 'cardio', 'full-body']],
  'DEKA': ['hiit', ['hiit', 'functional', 'endurance', 'weights', 'full-body', 'advanced']],
  'Functional Circuit': ['hiit', ['circuit', 'functional', 'hiit', 'strength', 'cardio', 'full-body']],
  'HIIT Circuit': ['hiit', ['hiit', 'circuit', 'cardio', 'intervals', 'full-body']],
  'Circuit': ['hiit', ['circuit', 'strength', 'cardio', 'endurance', 'full-body', 'functional']],
  'Power Up': ['hiit', ['hiit', 'conditioning', 'weights', 'cardio', 'full-body']],
  'Bootcamp': ['hiit', ['hiit', 'circuit', 'cardio', 'weights', 'full-body', 'functional']],
  'Boxfit': ['hiit', ['boxing', 'hiit', 'pads', 'cardio', 'full-body']],
  'Fitstart': ['hiit', ['beginner', 'circuit', 'hiit', 'cardio', 'functional']],

  // --- Dance ---
  'Zumba': ['dance', ['dance', 'cardio', 'latin', 'fat-burn']],
  'Clubbercise': ['dance', ['dance', 'cardio', 'toning', 'fat-burn']],
  'Les Mills Dance': ['dance', ['dance', 'cardio', 'les-mills', 'fat-burn']],
  'Chi Chi Fit': ['dance', ['dance', 'cardio', 'broadway', 'fat-burn']],

  // --- Mind & body ---
  'Pilates': ['mindBody', ['pilates', 'core', 'strength', 'flexibility', 'stability', 'low-impact']],
  'Clinical Pilates': ['mindBody', ['pilates', 'rehab', 'low-impact', 'gentle', 'beginner']],
  'Yoga': ['mindBody', ['yoga', 'flexibility', 'relaxation', 'breathwork']],
  'Hatha Yoga': ['mindBody', ['yoga', 'flexibility', 'breathwork', 'relaxation', 'low-impact']],
  'Vinyasa Yoga': ['mindBody', ['yoga', 'flexibility', 'strength', 'flow']],
  'Ashtanga Yoga': ['mindBody', ['yoga', 'flexibility', 'strength', 'flow', 'advanced']],
  'Body Balance': ['mindBody', ['yoga', 'pilates', 'tai-chi', 'flexibility', 'strength', 'relaxation', 'les-mills', 'low-impact']],
  'Les Mills Shapes': ['mindBody', ['pilates', 'barre', 'yoga', 'core', 'strength', 'les-mills', 'low-impact']],
  'Barre': ['mindBody', ['barre', 'ballet', 'legs', 'core', 'toning', 'flexibility', 'strength']],
  'Tai Chi': ['mindBody', ['tai-chi', 'balance', 'mobility', 'relaxation', 'low-impact', 'gentle']],
  'Stretch': ['mindBody', ['flexibility', 'stretch', 'mobility', 'low-impact']],
  'Mobility': ['mindBody', ['mobility', 'flexibility', 'recovery', 'low-impact']],

  // --- Aqua ---
  'Aqua Fit': ['aqua', ['aqua', 'cardio', 'toning', 'low-impact', 'full-body']],
  'Aqua Med': ['aqua', ['aqua', 'low-impact', 'gentle', 'strength', 'over-50s']],
  'Aqua Zumba': ['aqua', ['aqua', 'dance', 'latin', 'cardio', 'low-impact']],
  'Aqua Circuit': ['aqua', ['aqua', 'circuit', 'cardio', 'low-impact']],
  'Swimfit': ['aqua', ['aqua', 'swimming', 'cardio', 'endurance']],

  // --- Gentle & over 50s ---
  'Mature Movers': ['over50s', ['over-50s', 'low-impact', 'cardio', 'mobility', 'gentle', 'beginner']],
  'Zumba Gold': ['over50s', ['dance', 'over-50s', 'low-impact', 'cardio', 'beginner']],
  'Chair Pilates': ['over50s', ['pilates', 'chair', 'seated', 'low-impact', 'gentle', 'over-50s', 'mobility']],
  'Health Circuit': ['over50s', ['circuit', 'low-impact', 'cardio', 'resistance', 'gentle', 'rehab']],
  'Wellbeing Circuit': ['over50s', ['circuit', 'low-impact', 'cardio', 'resistance', 'gentle', 'wellbeing']],
  'Next Steps for Cancer': ['over50s', ['rehab', 'gentle', 'low-impact', 'circuit', 'over-50s']],

  // --- Appointments ---
  'Gym Induction': ['appointments', ['induction', 'beginner', 'personal-training']],
}

/**
 * Noise words stripped from a name before it is matched.
 *
 * These are facts *about* a class rather than the class itself — whether it is
 * virtual, Les Mills branded, women-only, a shorter "express" cut, or pitched
 * at a level — and every one of them appears bolted onto many different
 * classes. Removing them before matching is what collapses `Virtual Body Pump
 * Express` and `Body Pump` onto one row; the ones worth keeping are re-added as
 * tags by `crossCuttingTags`.
 */
const NOISE_WORDS = new Set([
  'virtual', 'les', 'mills', 'lesmills', 'express', 'exp', 'expres',
  'beginner', 'beginners', 'intermediate', 'advanced',
  'female', 'ladies', 'women', 'womens', 'only', 'mens',
  'and', 'the', 'kal', 'lm',
])

/** Lower-cases, splits on anything non-alphanumeric, and drops the noise words. */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(token => token && !NOISE_WORDS.has(token))
}

/** The normalised match key: the kept tokens, run together. */
const keyOf = (name: string) => tokens(name).join('')

/** Case- and noise-insensitive index over `CLASSES`, built once. */
const BY_KEY = new Map<string, ClassInfo>(
  Object.entries(CLASSES).map(([name, [category, tags]]) => [
    keyOf(name),
    { category, tags },
  ]),
)

/**
 * Tags read straight off the raw name, whatever the class is.
 *
 * These are the noise words worth keeping: a member does search "virtual" to
 * find (or avoid) the unstaffed classes, and "les mills" and "women only" are
 * real filters. Added to every class whose name carries them, curated or not.
 */
function crossCuttingTags(name: string): string[] {
  const lower = name.toLowerCase()
  const tags: string[] = []
  if (/virtual/.test(lower)) tags.push('virtual')
  if (/les\s*mills|\blm\b/.test(lower)) tags.push('les-mills')
  if (/female|ladies|women|\bmens?\b/.test(lower)) tags.push('women-only')
  if (/express/.test(lower)) tags.push('express')
  if (/beginner|\bintro\b|fitstart/.test(lower)) tags.push('beginner')
  if (/advanced/.test(lower)) tags.push('advanced')
  return tags
}

/**
 * Categorises a class by name.
 *
 * Tries the curated table on the normalised key, then falls back to keyword
 * matching so classes added to the timetable later — or spelled a new way —
 * still group sensibly instead of vanishing into a catch-all. Either way, the
 * cross-cutting tags (virtual, Les Mills, …) are mixed in.
 */
export function lookupClass(name: string): ClassInfo {
  const key = keyOf(name)
  const base = BY_KEY.get(key) ?? { category: guess(key), tags: [] }
  const tags = [...new Set([...base.tags, ...crossCuttingTags(name)])]
  return { category: base.category, tags }
}

/**
 * Keyword fallback for classes not in the table, most specific first.
 *
 * Operates on the normalised key (noise words and punctuation already gone), so
 * `includes` catches `rpm` inside `r p m` and does not trip over `virtual` or
 * `express`. Order matters: the gentle and mind-body cues come before the
 * generic cardio ones so "Next Steps for Cancer" is not read as a step class
 * and "Aerotone" is not read as strength.
 */
function guess(key: string): Category {
  const has = (word: string) => key.includes(word)

  if (has('induction') || has('checkup') || has('assessment') || has('taster')) return 'appointments'
  if (has('aqua') || has('swim')) return 'aqua'
  if (has('kids') || has('family') || has('teen') || has('junior') || has('gymnastics')) return 'kids'
  if (has('cancer') || has('maturemovers') || has('zumbagold') || has('chair') || has('over50')) {
    return 'over50s'
  }
  if (
    has('yoga') || has('pilates') || has('barre') || has('stretch') || has('mobility')
    || has('taichi') || has('meditation') || has('savasana') || has('balance') || has('shapes')
  ) {
    return 'mindBody'
  }
  if (has('rpm') || has('sprint') || has('thetrip') || has('cyc') || has('spin') || has('bike')) {
    return 'cycling'
  }
  if (has('zumba') || has('clubbercise') || has('dance') || has('shbam') || has('soca') || has('bollywood')) {
    return 'dance'
  }
  if (
    has('deka') || has('hyrox') || has('grit') || has('bootcamp') || has('hiit')
    || has('circuit') || has('powerup') || has('fitstart') || has('box') || has('hydrohex')
  ) {
    return 'hiit'
  }
  if (has('aero')) return 'cardio'
  if (has('pump') || has('strength') || has('tone') || has('sculpt') || has('abs')
    || has('core') || has('lbt') || has('kettlebell') || has('legsbums')) {
    return 'strength'
  }
  // Attack, Combat, Step and anything else default to cardio.
  return 'cardio'
}

/**
 * Whether a class matches a free-text query like `legs`, `virtual` or
 * `les mills`. Matches the class name, its tags, and its category.
 *
 * Multi-word queries are treated as "all words must match somewhere", so
 * `beginner pilates` narrows rather than widens.
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  const info = lookupClass(name)
  const category = CATEGORIES[info.category]
  const haystack = [
    name.toLowerCase(),
    category.label.toLowerCase(),
    ...info.tags,
    ...category.aliases,
  ]

  return needle.split(/\s+/).every(word => haystack.some(straw => straw.includes(word)))
}
