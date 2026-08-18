<script setup lang="ts">
import { CATEGORIES, CATEGORY_ORDER, matchesQuery, type Category } from '#shared/categories'
import { relativeDayLabel, dayLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'
import type { ClassRow } from '#shared/types'

useHead({ title: 'Timetable · BigBuds' })

const toast = useToast()

/**
 * The club publishes about a fortnight ahead, which is also as far as anyone
 * plans. `today()` is the club's own date, not the browser's.
 */
const today = clubToday()
const tomorrow = addDays(today, 1)
const days = Array.from({ length: 14 }, (_, offset) => addDays(today, offset))

const date = ref(today)
const query = ref('')
const grouping = ref<'category' | 'time'>('category')

const { data, status, refresh } = await useFetch('/api/planning', {
  query: { date },
})

const entries = computed<ClassRow[]>(() => (data.value?.entries ?? []) as ClassRow[])

const visible = computed(() =>
  entries.value.filter(entry => matchesQuery(entry.name, query.value)))

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

async function book(entry: ClassRow) {
  pendingId.value = entry.id
  try {
    const result = await $fetch('/api/classes/book', {
      method: 'POST',
      body: { classEventId: entry.id },
    })

    // Booking and joining the waiting list are the same request; the server
    // decides. Say which one actually happened.
    toast.add(
      result.queued
        ? {
            title: `On the waiting list for ${entry.name}`,
            description: 'The club promotes automatically if a place frees up.',
            color: 'warning',
            icon: 'i-lucide-hourglass',
          }
        : {
            title: `Booked ${entry.name}`,
            description: 'Other members can see you are going.',
            color: 'success',
            icon: 'i-lucide-check',
          },
    )
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Could not book that class',
      description: describe(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    pendingId.value = null
  }
}

async function cancel(entry: ClassRow) {
  if (!entry.attendeeId) return

  pendingId.value = entry.id
  try {
    await $fetch('/api/classes/cancel', {
      method: 'POST',
      body: { attendeeId: entry.attendeeId },
    })
    toast.add({
      title: `Cancelled ${entry.name}`,
      color: 'neutral',
      icon: 'i-lucide-x',
    })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Could not cancel that booking',
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
          {{ data?.club ?? 'BigBox Leisure Club' }}
          <template v-if="bookedCount">
            · you have {{ bookedCount }} on this day
          </template>
        </p>
      </div>

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

    <!-- Day picker: a fortnight, scrolling sideways on a phone. -->
    <div class="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
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
      :title="query ? 'Nothing matches that search' : 'No classes on this day'"
      :description="query
        ? 'Try a broader word — legs, cardio, beginner — or clear the search.'
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
            @book="book"
            @cancel="cancel"
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
        @book="book"
        @cancel="cancel"
      />
    </div>
  </div>
</template>
