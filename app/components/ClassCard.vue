<script setup lang="ts">
import type { ClassRow } from '#shared/types'
import { placesText, queuePositionText, timeRange } from '#shared/format'

const props = defineProps<{
  entry: ClassRow
  pending?: boolean
}>()

const emit = defineEmits<{
  book: [entry: ClassRow]
  cancel: [entry: ClassRow]
}>()

const when = computed(() => timeRange(props.entry.start, props.entry.durationMinutes))
const places = computed(() => placesText(props.entry))

/**
 * What the one button on this row should do.
 *
 * Booking and joining a waiting list are the same request to BigBox, but they
 * are not the same promise to the member, so they are never labelled the same.
 */
const action = computed(() => {
  const { entry } = props

  if (entry.isCancelled || entry.finished) return null

  if (entry.booked || entry.queued) {
    // Past the club's cancellation deadline, the API refuses the transition.
    if (entry.cancellable === false) return null
    return {
      label: entry.queued ? 'Leave list' : 'Cancel',
      color: 'neutral' as const,
      variant: 'outline' as const,
      event: 'cancel' as const,
    }
  }

  if (entry.hasQueueSpace) {
    return {
      label: 'Join waiting list',
      color: 'warning' as const,
      variant: 'soft' as const,
      event: 'book' as const,
    }
  }

  // Full, with the queue full too — there is nothing to press, and the places
  // line already says how many are ahead.

  if (entry.isFull) return null

  return {
    label: 'Book',
    color: 'primary' as const,
    variant: 'solid' as const,
    event: 'book' as const,
  }
})

const status = computed(() => {
  const { entry } = props
  if (entry.isCancelled) return { label: 'Cancelled', color: 'error' as const }
  if (entry.booked) return { label: 'Booked', color: 'success' as const }
  if (entry.queued) {
    // "#2 of 6" rather than a bare "#2": how long the queue is is what tells
    // you whether the club's auto-promotion is likely to reach you.
    const place = queuePositionText(entry.queuePosition, entry.queueCount)
    return {
      label: place ? `Waiting list ${place}` : 'Waiting list',
      color: 'warning' as const,
    }
  }
  if (entry.finished) return { label: 'Finished', color: 'neutral' as const }
  return null
})

/**
 * TypeScript will not narrow `emit(action.event, ...)` across the union of
 * event names, so the branch is written out.
 */
function trigger() {
  if (!action.value) return
  if (action.value.event === 'cancel') emit('cancel', props.entry)
  else emit('book', props.entry)
}

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase()
</script>

<template>
  <div
    class="flex gap-3 rounded-lg border border-default bg-elevated/40 p-3 transition-colors"
    :class="entry.finished || entry.isCancelled ? 'opacity-55' : 'hover:border-inverted/20'"
  >
    <!-- The activity's own colour from the API, as a spine down the row. -->
    <div
      class="w-1 shrink-0 rounded-full"
      :style="{ backgroundColor: entry.colorHex || 'var(--ui-border-accented)' }"
    />

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-mono text-sm tabular-nums text-muted">{{ when }}</span>
        <h3 class="font-medium tracking-tight">{{ entry.name }}</h3>
        <UBadge
          v-if="status"
          :label="status.label"
          :color="status.color"
          variant="soft"
          size="sm"
        />
      </div>

      <p class="mt-0.5 truncate text-sm text-muted">
        <span v-if="entry.coach">{{ entry.coach }}</span>
        <span v-if="entry.coach && entry.studio"> · </span>
        <span v-if="entry.studio">{{ entry.studio }}</span>
        <span v-if="(entry.coach || entry.studio) && places"> · </span>
        <span :class="entry.isFull && !entry.isCancelled ? 'text-warning' : ''">{{ places }}</span>
      </p>

      <!-- The point of the whole app. -->
      <div v-if="entry.going.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <UAvatarGroup size="2xs" :max="4">
          <UAvatar
            v-for="person in entry.going"
            :key="person.contactId"
            :text="initials(person.name)"
            :alt="person.name"
            :ui="{ root: person.state === 'queued' ? 'opacity-60' : '' }"
          />
        </UAvatarGroup>
        <span class="text-xs text-muted">
          {{ entry.going.map(person => person.name.split(' ')[0]).join(', ') }}
          {{ entry.going.length === 1 ? 'is' : 'are' }} going
        </span>
      </div>
    </div>

    <div class="flex shrink-0 items-center">
      <UButton
        v-if="action"
        :label="action.label"
        :color="action.color"
        :variant="action.variant"
        :loading="pending"
        size="sm"
        @click="trigger"
      />
    </div>
  </div>
</template>
