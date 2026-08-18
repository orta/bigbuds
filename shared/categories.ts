/**
 * Curated categories and tags for BigBox's class timetable.
 *
 * The API does expose its own `activity_groups` (Cardio, Toning, Mind and
 * Body, …), but they are both too coarse to browse by and visibly wrong in
 * places — "Beginners Hyrox" is filed under *Dance*, "Zumba Gold" under
 * *Aqua*. So this table is maintained here instead, derived from each class's
 * own description in the member API.
 *
 * Every class gets exactly one `Category`, which is what the planning view
 * groups by, plus any number of free-form tags, which is what search matches
 * on. Tags are the goal- and body-part words a member would actually type —
 * `legs`, `strength`, `weights`, `core` — and deliberately overlap.
 *
 * Classes the club adds later will not be in the table; `lookupClass` falls
 * back to keyword matching on the name so they still land somewhere sensible.
 *
 * Ported from `src/categories.rs` in bigbox-for-cosmic. This lives in
 * `shared/` because both the server (grouping the planning response) and the
 * client (filtering as you type) need it.
 */

export type Category =
  | 'strength'
  | 'hiit'
  | 'cardio'
  | 'dance'
  | 'mindBody'
  | 'reformer'
  | 'aqua'
  | 'ems'
  | 'over50s'
  | 'kids'
  | 'appointments'

export interface CategoryInfo {
  label: string
  /**
   * A one-line explainer shown under the heading in the planning view.
   *
   * Most of these are self-evident from the name; EMS and Reformer are the
   * ones that genuinely need explaining, since both are equipment brands as
   * much as class types and neither tells you what you would actually be doing.
   */
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
  strength: {
    label: 'Strength & Weights',
    description: 'Barbells, dumbbells and bodyweight — building muscle and tone.',
    aliases: ['strength', 'weights', 'lifting', 'toning'],
    icon: 'i-lucide-dumbbell',
  },
  hiit: {
    label: 'HIIT & Conditioning',
    description: 'Circuits and intervals: short hard efforts with brief recovery.',
    aliases: ['hiit', 'conditioning', 'circuit', 'bootcamp'],
    icon: 'i-lucide-flame',
  },
  cardio: {
    label: 'Cardio',
    description: 'Heart-rate and endurance work — bikes, steps and aerobics.',
    aliases: ['cardio', 'fitness'],
    icon: 'i-lucide-heart-pulse',
  },
  dance: {
    label: 'Dance',
    description: 'Choreographed routines set to music. No experience needed.',
    aliases: ['dance', 'dancing'],
    icon: 'i-lucide-music',
  },
  mindBody: {
    label: 'Mind & Body',
    description: 'Yoga, Pilates, stretching and meditation — flexibility and calm.',
    aliases: ['mind', 'body', 'wellness', 'relax'],
    icon: 'i-lucide-flower-2',
  },
  reformer: {
    label: 'Reformer',
    description:
      'Pilates on a sprung carriage. The springs both assist and resist, so it suits '
      + 'beginners and advanced alike — low impact on the joints.',
    aliases: ['reformer', 'pilates'],
    icon: 'i-lucide-move-horizontal',
  },
  aqua: {
    label: 'Aqua',
    description:
      'In the pool. The water supports your joints while adding resistance, so it is '
      + 'low impact but still hard work. No swimming ability needed.',
    aliases: ['aqua', 'water', 'pool', 'swimming'],
    icon: 'i-lucide-waves',
  },
  ems: {
    label: 'EMS',
    description:
      'Electro Muscle Stimulation, branded Electric Box here. You wear a suit that sends '
      + 'electrical pulses through your muscles while you exercise, contracting far more '
      + 'fibres than movement alone. Sessions are 20 minutes, one-to-one with a trainer, '
      + 'and low impact — used for strength, recovery and pain relief.',
    aliases: ['ems', 'electro', 'personal training', 'pt'],
    icon: 'i-lucide-zap',
  },
  over50s: {
    label: 'Over 50s',
    description: 'Slower paced and lower impact, aimed at older adults.',
    aliases: ['over 50s', 'seniors', 'mature', 'gentle'],
    icon: 'i-lucide-sun',
  },
  kids: {
    label: 'Kids & Family',
    description: 'For children, teenagers and families training together.',
    aliases: ['kids', 'family', 'children', 'teens'],
    icon: 'i-lucide-baby',
  },
  appointments: {
    label: 'Inductions & Check-ups',
    description:
      'One-to-one inductions and assessments rather than group classes — book these to '
      + 'get set up on the gym equipment.',
    aliases: ['induction', 'check-up', 'appointment', 'assessment'],
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
 * Curated from each class's description in the member API. Names are matched
 * case-insensitively against the activity name.
 */
const CLASSES: Record<string, [Category, string[]]> = {
  // --- Strength & weights ---
  'Body Pump': ['strength', ['strength', 'weights', 'barbell', 'toning', 'full-body', 'core', 'legs']],
  'Grit Strength': ['strength', ['strength', 'weights', 'barbell', 'hiit', 'full-body']],
  'Body Sculpt': ['strength', ['strength', 'weights', 'toning', 'full-body', 'bodyweight', 'intervals']],
  'Low and Tone': ['strength', ['strength', 'toning', 'full-body', 'low-impact']],
  'Legs, Bums and Tums': ['strength', ['legs', 'glutes', 'core', 'toning', 'lower-body']],
  'Abs Blast': ['strength', ['core', 'abs', 'strength', 'stability']],

  // --- HIIT & conditioning ---
  'HYROX': ['hiit', ['hiit', 'running', 'functional', 'weights', 'endurance', 'full-body', 'advanced']],
  'Beginners Hyrox': ['hiit', ['hiit', 'running', 'functional', 'weights', 'endurance', 'beginner']],
  'Bootcamp': ['hiit', ['hiit', 'circuit', 'cardio', 'weights', 'full-body', 'functional']],
  'Boxing Bootcamp': ['hiit', ['boxing', 'martial-arts', 'hiit', 'circuit', 'weights', 'cardio', 'full-body']],
  'Beginners Bootcamp': ['hiit', ['hiit', 'circuit', 'cardio', 'full-body', 'beginner']],
  'HIIT and Tone': ['hiit', ['hiit', 'cardio', 'weights', 'toning', 'endurance', 'full-body']],

  // --- Cardio ---
  'Spin': ['cardio', ['cardio', 'cycling', 'legs', 'fat-burn', 'endurance']],
  'PEAK SPIN': ['cardio', ['cardio', 'cycling', 'legs', 'endurance', 'advanced']],
  'Body Attack': ['cardio', ['cardio', 'hiit', 'athletic', 'functional', 'full-body']],
  'Body Combat': ['cardio', ['martial-arts', 'boxing', 'cardio', 'hiit', 'full-body', 'fat-burn']],
  'Step Aerobics': ['cardio', ['cardio', 'aerobics', 'step', 'legs', 'coordination']],
  'Old Skool Aerobics': ['cardio', ['cardio', 'aerobics', 'coordination', 'dance']],
  'Aerotone': ['cardio', ['cardio', 'aerobics', 'toning', 'weights', 'coordination']],
  'BIGBOX Bounce': ['cardio', ['cardio', 'trampoline', 'dance', 'legs', 'fat-burn', 'low-impact']],

  // --- Dance ---
  'Zumba': ['dance', ['dance', 'cardio', 'latin', 'fat-burn']],
  "Sh'Bam": ['dance', ['dance', 'cardio', 'fat-burn']],
  'Clubbercise': ['dance', ['dance', 'cardio', 'toning', 'fat-burn']],
  'Soca': ['dance', ['dance', 'cardio', 'endurance', 'caribbean']],

  // --- Mind & body ---
  'Pilates': ['mindBody', ['pilates', 'core', 'strength', 'flexibility', 'stability', 'low-impact']],
  'Beginners Pilates': ['mindBody', ['pilates', 'core', 'strength', 'beginner', 'low-impact']],
  'Clinical Pilates': ['mindBody', ['pilates', 'rehab', 'low-impact', 'gentle', 'beginner']],
  'Pilates Mix (Clinical and Beginners)': ['mindBody', ['pilates', 'rehab', 'beginner', 'low-impact']],
  'Circle Pilates': ['mindBody', ['pilates', 'core', 'strength', 'equipment']],
  'Yoga': ['mindBody', ['yoga', 'flexibility', 'relaxation', 'breathwork']],
  'Beginners Yoga': ['mindBody', ['yoga', 'flexibility', 'relaxation', 'beginner', 'low-impact']],
  'Hatha Yoga': ['mindBody', ['yoga', 'flexibility', 'breathwork', 'relaxation', 'low-impact']],
  'Vinyasa Yoga': ['mindBody', ['yoga', 'flexibility', 'strength', 'flow']],
  'Body Balance': ['mindBody', ['yoga', 'pilates', 'tai-chi', 'flexibility', 'strength', 'relaxation', 'low-impact']],
  'Pure Stretch': ['mindBody', ['flexibility', 'stretch', 'mobility', 'pilates', 'yoga', 'low-impact']],
  'KINISIFLOW': ['mindBody', ['flexibility', 'mobility', 'recovery', 'flow', 'strength']],
  'Barre': ['mindBody', ['barre', 'ballet', 'legs', 'core', 'toning', 'flexibility', 'strength']],
  'Tai Chi': ['mindBody', ['tai-chi', 'balance', 'mobility', 'relaxation', 'low-impact', 'gentle']],
  'Dynamic Meditation': ['mindBody', ['meditation', 'breathwork', 'relaxation', 'qigong', 'low-impact']],
  'Sunday śavāsana': ['mindBody', ['meditation', 'relaxation', 'yoga', 'sleep', 'low-impact']],

  // --- Reformer ---
  'Beginners Reformer': ['reformer', ['pilates', 'reformer', 'beginner', 'core', 'flexibility', 'full-body', 'low-impact']],
  'Full Body Reformer': ['reformer', ['pilates', 'reformer', 'full-body', 'strength', 'core', 'flexibility']],
  'Advanced Reformer': ['reformer', ['pilates', 'reformer', 'advanced', 'core', 'strength', 'balance']],
  'Clinical Reformer': ['reformer', ['pilates', 'reformer', 'rehab', 'low-impact', 'gentle']],
  'Ladies Only Reformer': ['reformer', ['pilates', 'reformer', 'legs', 'lower-body', 'full-body', 'women-only']],
  'Rise and Reform': ['reformer', ['pilates', 'reformer', 'stretch', 'core', 'posture', 'morning']],
  'Reformer Taster': ['reformer', ['pilates', 'reformer', 'beginner']],

  // --- Aqua ---
  'Aqua Fit': ['aqua', ['aqua', 'cardio', 'toning', 'low-impact', 'full-body']],
  'Aqua Combat': ['aqua', ['aqua', 'martial-arts', 'toning', 'cardio', 'low-impact']],
  'Aqua Groove': ['aqua', ['aqua', 'dance', 'cardio', 'low-impact']],
  'Aqua Zumba': ['aqua', ['aqua', 'dance', 'latin', 'cardio', 'low-impact']],
  'AQUA PILATES': ['aqua', ['aqua', 'pilates', 'core', 'flexibility', 'balance', 'low-impact']],
  'Aqua Med': ['aqua', ['aqua', 'low-impact', 'gentle', 'strength', 'over-50s']],

  // --- EMS ---
  'EMS Session': ['ems', ['ems', 'strength', 'full-body', 'recovery', 'personal-training', 'low-impact']],

  // --- Over 50s ---
  'Mature Movers': ['over50s', ['over-50s', 'low-impact', 'cardio', 'mobility', 'gentle', 'beginner']],
  'Zumba Gold': ['over50s', ['dance', 'over-50s', 'low-impact', 'cardio', 'beginner']],

  // --- Kids & family ---
  'Family Bootcamp 8yr+': ['kids', ['family', 'kids', 'cardio', 'hiit']],
  'Family Time (age 4+)': ['kids', ['family', 'kids']],
  'Kids Fun session Age 5-12': ['kids', ['kids']],
  'Kids Gymnastics Age 5+': ['kids', ['kids', 'gymnastics']],
  'Teen Performance Workshop Age 11-15': ['kids', ['teens', 'kids', 'sports', 'agility', 'speed']],

  // --- Appointments ---
  'BIGBOX Fit Induction': ['appointments', ['induction', 'beginner', 'personal-training']],
  'Bio Circuit Induction': ['appointments', ['induction', 'beginner', 'weights', 'personal-training']],
  'Box12 Induction': ['appointments', ['induction', 'boxing', 'beginner']],
  'Teen Gym Induction': ['appointments', ['induction', 'teens', 'kids']],
  'BIGBOX Check-Up': ['appointments', ['assessment', 'check-up', 'personal-training']],
}

/** Case-insensitive index over `CLASSES`, built once. */
const BY_LOWER_NAME = new Map<string, ClassInfo>(
  Object.entries(CLASSES).map(([name, [category, tags]]) => [
    name.toLowerCase(),
    { category, tags },
  ]),
)

/**
 * Categorises a class by name.
 *
 * Falls back to keyword matching so classes added to the timetable after this
 * table was written still group sensibly instead of vanishing into a catch-all.
 */
export function lookupClass(name: string): ClassInfo {
  const needle = name.trim().toLowerCase()
  return BY_LOWER_NAME.get(needle) ?? { category: guess(needle), tags: [] }
}

/** Keyword fallback for classes not in the table, most specific first. */
function guess(needle: string): Category {
  const has = (word: string) => needle.includes(word)

  if (has('induction') || has('check-up') || has('taster')) return 'appointments'
  if (has('aqua')) return 'aqua'
  if (has('reformer')) return 'reformer'
  if (has('ems')) return 'ems'
  if (has('kids') || has('family') || has('teen') || has('junior')) return 'kids'
  if (has('gold') || has('over 50') || has('mature')) return 'over50s'
  if (has('yoga') || has('pilates') || has('stretch') || has('meditation') || has('barre')) {
    return 'mindBody'
  }
  if (has('zumba') || has('dance') || has('bam')) return 'dance'
  if (has('hyrox') || has('bootcamp') || has('hiit') || has('circuit')) return 'hiit'
  if (has('pump') || has('strength') || has('tone') || has('sculpt') || has('abs')) {
    return 'strength'
  }
  return 'cardio'
}

/**
 * Whether a class matches a free-text query like `legs`, `strength` or
 * `weights`. Matches the class name, its tags, and its category.
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
