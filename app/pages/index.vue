<script setup lang="ts">
import { CATEGORIES, CATEGORY_ORDER, matchesQuery, type Category } from '#shared/categories'
import { relativeDayLabel, dayLabel } from '#shared/format'
import { bookableDays, lastBookableDate } from '#shared/booking'
import { addDays, today as clubToday } from '#shared/naive'
import type { BookingBuddy, ClassRow } from '#shared/types'

useHead({ title: 'Timetable · KAL Pal' })

const toast = useToast()
const { user, fetch: refreshSession } = useUserSession()

/**
 * Display preferences, persisted per member.
 *
 * Held locally and written back on change so the timetable reacts at once
 * rather than waiting for a round trip; the request that saves them is what
 * makes the choice survive to the next visit.
 */
const hiddenCategories = ref(new Set(user.value?.hiddenCategories ?? []))
const hideFinished = ref(user.value?.hideFinished ?? false)
const hideVirtual = ref(user.value?.hideVirtual ?? false)

async function savePreferences() {
  try {
    await $fetch('/api/me', {
      method: 'PATCH',
      body: {
        hiddenCategories: [...hiddenCategories.value],
        hideFinished: hideFinished.value,
        hideVirtual: hideVirtual.value,
      },
    })
    await refreshSession()
  } catch {
    toast.add({
      title: 'Could not save that preference',
      description: 'It applies for now, but will not be remembered.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
}

function toggleCategory(category: Category, shown: boolean) {
  if (shown) hiddenCategories.value.delete(category)
  else hiddenCategories.value.add(category)
  // A Set mutates in place, so nudge reactivity before saving.
  triggerRef(hiddenCategories)
  savePreferences()
}

function toggleFinished(hidden: boolean) {
  hideFinished.value = hidden
  savePreferences()
}

function toggleVirtual(hidden: boolean) {
  hideVirtual.value = hidden
  savePreferences()
}

/** The filter menu, with a count of what each category holds today. */
const filterItems = computed(() => [
  CATEGORY_ORDER.map((category: Category) => ({
    label: CATEGORIES[category].label,
    icon: CATEGORIES[category].icon,
    type: 'checkbox' as const,
    checked: !hiddenCategories.value.has(category),
    onUpdateChecked: (checked: boolean) => toggleCategory(category, checked),
    // Keep the menu open: hiding several categories in a row is the normal
    // way to use this.
    onSelect: (payload: Event) => payload.preventDefault(),
  })),
  [{
    label: 'Hide virtual classes',
    icon: 'i-lucide-monitor-play',
    type: 'checkbox' as const,
    checked: hideVirtual.value,
    onUpdateChecked: toggleVirtual,
    onSelect: (payload: Event) => payload.preventDefault(),
  }, {
    label: 'Hide classes that have finished',
    icon: 'i-lucide-history',
    type: 'checkbox' as const,
    checked: hideFinished.value,
    onUpdateChecked: toggleFinished,
    onSelect: (payload: Event) => payload.preventDefault(),
  }],
])

const hiddenCount = computed(() =>
  hiddenCategories.value.size + (hideFinished.value ? 1 : 0) + (hideVirtual.value ? 1 : 0))

/**
 * The days on offer, which are exactly the days the club will take a booking
 * for — see `#shared/booking`. `today()` is the club's own date, not the
 * browser's.
 */
const today = clubToday()
const tomorrow = addDays(today, 1)
const days = bookableDays(today)
const lastBookable = lastBookableDate(today)

/**
 * Which day is showing. `?date=` so a link can point at one — the notice about
 * a class somebody cancelled for you offers to find another that day.
 *
 * Checked against the days actually on offer rather than trusted: a date
 * outside the booking window would render a strip with nothing selected on it
 * and a timetable whose Book buttons are all going to fail.
 */
const route = useRoute()
const requested = Array.isArray(route.query.date) ? route.query.date[0] : route.query.date
const date = ref(typeof requested === 'string' && days.includes(requested) ? requested : today)

const query = ref('')
const grouping = ref<'category' | 'time'>('category')

const { data, status, refresh } = await useFetch('/api/planning', {
  query: { date },
})

const entries = computed<ClassRow[]>(() => (data.value?.entries ?? []) as ClassRow[])

/**
 * The people who have asked this member to book for them. Almost always
 * empty, and the timetable is unchanged when it is.
 */
const bookFor = computed<BookingBuddy[]>(() => data.value?.bookFor ?? [])

/**
 * The single filtered list both views render from.
 *
 * Deliberately one computed rather than one per view: the hidden categories
 * have to apply to the chronological list as well as the grouped one, and two
 * filter implementations would eventually disagree.
 */
const visible = computed(() =>
  entries.value.filter(entry =>
    matchesQuery(entry.name, query.value)
    && !hiddenCategories.value.has(entry.category)
    && !(hideFinished.value && entry.finished)
    && !(hideVirtual.value && entry.tags.includes('virtual'))))

/**
 * Classes grouped under the curated headings, empty categories dropped.
 * Grouping by time is just the API's own order, which is already ascending.
 */
const grouped = computed(() =>
  CATEGORY_ORDER
    .map((category: Category) => ({
      category,
      ...CATEGORIES[category],
      entries: visible.value.filter(entry => entry.category === category),
    }))
    .filter(group => group.entries.length > 0))

const bookedCount = computed(() =>
  entries.value.filter(entry => entry.booked || entry.queued).length)

// --- Actions ---

/** The class currently being booked or cancelled, so only its button spins. */
const pendingId = ref<string | null>(null)

/**
 * The class whose description and notes are open, if any.
 *
 * Held here rather than in each card so there is one modal on the page and one
 * request behind it, however many rows the day has.
 */
const detail = ref<ClassRow | null>(null)

/**
 * Books a class. `subject` is somebody who has asked this member to book for
 * them; without it the booking is the member's own.
 *
 * Every message names who it was for when it was not the member, because
 * "Booked" on a screen where you can act for two people says the wrong thing
 * half the time.
 */
async function book(entry: ClassRow, subject?: BookingBuddy) {
  pendingId.value = entry.id
  try {
    const result = await $fetch('/api/classes/book', {
      method: 'POST',
      body: { classEventId: entry.id, forContactId: subject?.contactId },
    })

    // Booking and joining the waiting list are the same request; the server
    // decides. Say which one actually happened.
    toast.add(
      result.queued
        ? {
            title: subject
              ? `${subject.name} is on the waiting list for ${entry.name}`
              : `On the waiting list for ${entry.name}`,
            description: subject
              ? 'If a place frees up it goes to whoever books first.'
              : 'A freed place goes to whoever books first — turn on auto-accept to have KAL Pal grab it.',
            color: 'warning',
            icon: 'i-lucide-hourglass',
          }
        : {
            title: subject
              ? `Booked ${subject.name} onto ${entry.name}`
              : `Booked ${entry.name}`,
            description: subject
              ? 'It is on their KAL account, so they will see it in the KAL app too.'
              : 'Other members can see you are going.',
            color: 'success',
            icon: 'i-lucide-check',
          },
    )
    await refresh()
  } catch (error) {
    toast.add({
      title: subject ? `Could not book ${subject.name} in` : 'Could not book that class',
      description: describe(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    pendingId.value = null
  }
}

async function cancel(entry: ClassRow, subject?: BookingBuddy) {
  // The viewer's own attendee IRI is on the row; somebody else's is not ours
  // to know, so those cancellations name the class and let the server find it.
  if (!subject && !entry.attendeeId) return

  pendingId.value = entry.id
  try {
    await $fetch('/api/classes/cancel', {
      method: 'POST',
      body: subject
        ? { classEventId: entry.id, forContactId: subject.contactId }
        : { attendeeId: entry.attendeeId },
    })
    toast.add({
      title: subject
        ? `Cancelled ${entry.name} for ${subject.name}`
        : `Cancelled ${entry.name}`,
      color: 'neutral',
      icon: 'i-lucide-x',
    })
    await refresh()
  } catch (error) {
    toast.add({
      title: subject
        ? `Could not cancel that for ${subject.name}`
        : 'Could not cancel that booking',
      description: describe(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    pendingId.value = null
  }
}

const describe = (error: unknown) =>
  (error as { statusMessage?: string }).statusMessage ?? 'Please try again.'
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ dayLabel(date) }}
        </h1>
        <p class="text-sm text-muted">
          {{ data?.club ?? 'Kirklees Active Leisure' }}
          <template v-if="bookedCount">
            · you have {{ bookedCount }} on this day
          </template>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UDropdownMenu :items="filterItems" :ui="{ content: 'w-64' }">
          <UButton
            icon="i-lucide-sliders-horizontal"
            :label="hiddenCount ? `Filters (${hiddenCount})` : 'Filters'"
            :color="hiddenCount ? 'primary' : 'neutral'"
            :variant="hiddenCount ? 'soft' : 'ghost'"
            size="xs"
          />
        </UDropdownMenu>

        <UTabs
          v-model="grouping"
          size="xs"
          :content="false"
          :items="[
            { label: 'By category', value: 'category', icon: 'i-lucide-layout-list' },
            { label: 'By time', value: 'time', icon: 'i-lucide-clock' },
          ]"
        />
      </div>
    </div>

    <!-- Day picker: the booking window, scrolling sideways on a phone. -->
    <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      <UButton
        v-for="day in days"
        :key="day"
        :label="relativeDayLabel(day, today, tomorrow)"
        :color="day === date ? 'primary' : 'neutral'"
        :variant="day === date ? 'solid' : 'subtle'"
        size="sm"
        class="shrink-0"
        @click="date = day"
      />
    </div>

    <!-- Why the strip stops where it does, rather than leaving it to be
         discovered by a booking that fails. -->
    <p class="mb-4 mt-1.5 text-xs text-dimmed">
      KAL takes bookings up to {{ dayLabel(lastBookable) }}.
    </p>

    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search by what you want — legs, strength, beginner, low-impact…"
      class="mb-5 w-full"
      :ui="{ trailing: 'pe-1' }"
    >
      <template v-if="query" #trailing>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="xs"
          aria-label="Clear search"
          @click="query = ''"
        />
      </template>
    </UInput>

    <div v-if="status === 'pending' && !entries.length" class="space-y-2">
      <USkeleton v-for="n in 6" :key="n" class="h-20 w-full" />
    </div>

    <UAlert
      v-else-if="!visible.length"
      icon="i-lucide-calendar-x"
      color="neutral"
      variant="subtle"
      :title="query ? 'Nothing matches that search'
        : hiddenCount ? 'Everything here is filtered out'
          : 'No classes on this day'"
      :description="query
        ? 'Try a broader word — legs, cardio, beginner — or clear the search.'
        : hiddenCount ? 'There are classes on this day, but your filters hide them all.'
          : 'Pick another day from the strip above.'"
    />

    <!-- Grouped under the curated headings. -->
    <div v-else-if="grouping === 'category'" v-auto-animate class="space-y-7">
      <section v-for="group in grouped" :key="group.category">
        <div class="mb-2">
          <h2 class="flex items-center gap-2 font-semibold tracking-tight">
            <UIcon :name="group.icon" class="size-4 text-primary" />
            {{ group.label }}
            <span class="text-sm font-normal text-dimmed">{{ group.entries.length }}</span>
          </h2>
          <p class="mt-0.5 text-sm text-muted">
            {{ group.description }}
          </p>
        </div>

        <div class="space-y-2">
          <ClassCard
            v-for="entry in group.entries"
            :key="entry.id"
            :entry="entry"
            :pending="pendingId === entry.id"
            :book-for="bookFor"
            :show-site="data?.showSite"
            @book="book"
            @cancel="cancel"
            @open="detail = $event"
          />
        </div>
      </section>
    </div>

    <div v-else v-auto-animate class="space-y-2">
      <ClassCard
        v-for="entry in visible"
        :key="entry.id"
        :entry="entry"
        :pending="pendingId === entry.id"
        :book-for="bookFor"
        :show-site="data?.showSite"
        show-around
        @book="book"
        @cancel="cancel"
        @open="detail = $event"
      />
    </div>

    <ClassDetail v-model="detail" />
  </div>
</template>
