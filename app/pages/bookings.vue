<script setup lang="ts">
import { dayLabel } from '#shared/format'
import { addDays, naiveDate, today as clubToday } from '#shared/naive'
import type { ClassRow } from '#shared/types'

useHead({ title: 'My classes · KAL Pal' })

const toast = useToast()
const today = clubToday()
const tomorrow = addDays(today, 1)

const { data, status, refresh } = await useFetch('/api/bookings')

const entries = computed<ClassRow[]>(() => (data.value?.entries ?? []) as ClassRow[])

/** Grouped by day, so a week of bookings reads as a week rather than a list. */
const byDay = computed(() => {
  const days = new Map<string, ClassRow[]>()

  for (const entry of entries.value) {
    if (!entry.start) continue
    const day = naiveDate(entry.start)
    const list = days.get(day) ?? []
    list.push(entry)
    days.set(day, list)
  }

  return [...days.entries()].map(([date, classes]) => ({
    date,
    label: date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : dayLabel(date),
    entries: classes,
  }))
})

const pendingId = ref<string | null>(null)

/** The class whose description and notes are open, if any. */
const detail = ref<ClassRow | null>(null)

async function cancel(entry: ClassRow) {
  if (!entry.attendeeId) return

  pendingId.value = entry.id
  try {
    await $fetch('/api/classes/cancel', {
      method: 'POST',
      body: { attendeeId: entry.attendeeId },
    })
    toast.add({ title: `Cancelled ${entry.name}`, icon: 'i-lucide-x', color: 'neutral' })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'Could not cancel that booking',
      description: (error as { statusMessage?: string }).statusMessage ?? 'Please try again.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold tracking-tight">
      My classes
    </h1>
    <p class="mb-5 text-sm text-muted">
      Everything you are booked onto or waiting for, straight from KAL.
    </p>

    <div v-if="status === 'pending' && !entries.length" class="space-y-2">
      <USkeleton v-for="n in 3" :key="n" class="h-20 w-full" />
    </div>

    <UAlert
      v-else-if="!entries.length"
      icon="i-lucide-calendar-plus"
      color="neutral"
      variant="subtle"
      title="Nothing booked yet"
      description="Find something on the timetable and book it — the people you train with will see it too."
      :actions="[{ label: 'Browse the timetable', to: '/', color: 'primary' }]"
    />

    <div v-else v-auto-animate class="space-y-6">
      <section v-for="day in byDay" :key="day.date">
        <h2 class="mb-2 font-semibold tracking-tight">
          {{ day.label }}
        </h2>
        <div class="space-y-2">
          <ClassCard
            v-for="entry in day.entries"
            :key="entry.id"
            :entry="entry"
            :pending="pendingId === entry.id"
            @cancel="cancel"
            @open="detail = $event"
          />
        </div>
      </section>
    </div>

    <ClassDetail v-model="detail" />
  </div>
</template>
