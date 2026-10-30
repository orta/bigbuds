import type { ClassRow } from '#shared/types'

/**
 * The class types this member has starred.
 *
 * One piece of state for the whole app rather than a prop threaded from each
 * page: the star is pressed on a timetable row, read by the same row and by
 * the detail modal, and shown again on My classes, and all of them have to
 * agree the instant it changes.
 *
 * Seeded from the session, which carries the stored list, and written back
 * through the same settings request as the other display preferences. The
 * change is applied locally first so the row lights up on the press; the save
 * is what makes it true next visit, and a failed save puts it back.
 */
export function useFavourites() {
  const { user, fetch: refreshSession } = useUserSession()
  const toast = useToast()

  // An array in the shared state, because that is what the session holds and
  // what goes over the wire; the Set is derived for the lookups.
  const stored = useState<string[]>('favourites', () => [...(user.value?.favourites ?? [])])
  const favourites = computed(() => new Set(stored.value))

  // The session is the truth, and it can change under this state — a save
  // from another tab, or a different member signing in without a reload.
  watch(() => user.value?.favourites, current => {
    if (current) stored.value = [...current]
  })

  /** Whether this row's class type is starred. A row with no type cannot be. */
  const has = (entry: Pick<ClassRow, 'activityId'>) =>
    entry.activityId !== null && favourites.value.has(entry.activityId)

  async function toggle(entry: Pick<ClassRow, 'activityId' | 'name'>) {
    if (!entry.activityId) return

    const before = stored.value
    const on = !favourites.value.has(entry.activityId)
    const next = on
      ? [...before, entry.activityId]
      : before.filter(id => id !== entry.activityId)
    stored.value = next

    try {
      await $fetch('/api/me', { method: 'PATCH', body: { favourites: next } })
      await refreshSession()
    } catch {
      stored.value = before
      toast.add({
        title: on ? `Could not star ${entry.name}` : `Could not unstar ${entry.name}`,
        description: 'Please try again.',
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
    }
  }

  return { favourites, has, toggle }
}
