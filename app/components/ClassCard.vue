<script setup lang="ts">
import type { BookingBuddy, ClassRow } from '#shared/types'
import { placesText, queuePositionText, timeRange } from '#shared/format'

const props = defineProps<{
  entry: ClassRow
  pending?: boolean
  /**
   * Show who is usually at the club around this time. Only the chronological
   * view asks for it — under a category heading the times jump around, so a
   * "usually here now" note beside each row would be noise.
   */
  showAround?: boolean
  /**
   * People who have asked this member to book for them. Empty for almost
   * everyone, which is why it is a second control rather than a change to the
   * one button the row already has.
   */
  bookFor?: BookingBuddy[]
}>()

/**
 * A missing subject means the viewer themselves — the ordinary case, and the
 * one the row's main button always emits.
 */
const emit = defineEmits<{
  book: [entry: ClassRow, subject?: BookingBuddy]
  cancel: [entry: ClassRow, subject?: BookingBuddy]
  /** The name was clicked: show what the club and other members say about it. */
  open: [entry: ClassRow]
}>()

const when = computed(() => timeRange(props.entry.start, props.entry.durationMinutes))
const places = computed(() => placesText(props.entry))

/**
 * What the one button on this row should do.
 *
 * Booking and joining a waiting list are the same request to KAL, but they
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

/**
 * The same decision as `action`, once per person the viewer can book for.
 *
 * Someone already on the class gets the way back off it, and someone who
 * cannot be fitted on stays in the menu saying so — dropping them would read
 * as the feature being broken for that person rather than the class being
 * full.
 */
const buddyItems = computed(() => {
  const { entry } = props
  const people = props.bookFor ?? []

  if (!people.length || entry.isCancelled || entry.finished) return []

  return [people.map(person => {
    const held = entry.bookedFor.find(booked => booked.contactId === person.contactId)

    if (held) {
      return {
        label: held.state === 'queued'
          ? `Take ${person.name} off the list`
          : `Cancel for ${person.name}`,
        icon: 'i-lucide-user-minus',
        onSelect: () => emit('cancel', entry, person),
      }
    }

    if (entry.isFull && !entry.hasQueueSpace) {
      return {
        label: `No room for ${person.name}`,
        icon: 'i-lucide-user-x',
        disabled: true,
      }
    }

    return {
      label: entry.hasQueueSpace
        ? `Put ${person.name} on the list`
        : `Book ${person.name} in`,
      icon: 'i-lucide-user-plus',
      onSelect: () => emit('book', entry, person),
    }
  })]
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

/**
 * Whether KAL Pal should book this waiting-list place the moment a space opens.
 *
 * Kept on the card rather than sent up to the page: it changes nothing else
 * on screen, so a round trip through the page's refresh would only make the
 * toggle feel slow. The next fetch of the row brings the stored answer back.
 */
const toast = useToast()
const autoAccept = ref(props.entry.autoAccept)
const savingAutoAccept = ref(false)
watch(() => props.entry.autoAccept, value => (autoAccept.value = value))

async function toggleAutoAccept() {
  const on = !autoAccept.value
  savingAutoAccept.value = true
  try {
    const result = await $fetch('/api/classes/auto-accept', {
      method: 'PUT',
      body: { classEventId: props.entry.id, on },
    })
    autoAccept.value = result.autoAccept
    toast.add(on
      ? {
          title: `Auto-accept on for ${props.entry.name}`,
          description: 'If a space opens, KAL Pal books it for you straight away.',
          icon: 'i-lucide-zap',
          color: 'success',
        }
      : { title: `Auto-accept off for ${props.entry.name}`, icon: 'i-lucide-zap-off', color: 'neutral' })
  } catch (error) {
    toast.add({
      title: 'Could not change auto-accept',
      description: (error as { statusMessage?: string }).statusMessage,
      color: 'error',
    })
  } finally {
    savingAutoAccept.value = false
  }
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

        <!-- The name is the way in to the description and the notes. A button
             rather than a link: it opens something beside the timetable rather
             than navigating away from the day you were reading. -->
        <h3 class="font-medium tracking-tight">
          <button
            type="button"
            class="rounded text-left decoration-dotted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :aria-label="`About ${entry.name}`"
            @click="emit('open', entry)"
          >
            {{ entry.name }}
          </button>
        </h3>

        <!-- What makes the name worth clicking. Silent at zero, because most
             classes have nothing behind them and sixty empty markers would
             teach people the marker means nothing. -->
        <UBadge
          v-if="entry.noteCount"
          :label="String(entry.noteCount)"
          icon="i-lucide-message-square-text"
          color="neutral"
          variant="subtle"
          size="sm"
          class="cursor-pointer"
          :aria-label="`${entry.noteCount} ${entry.noteCount === 1 ? 'note' : 'notes'} from members`"
          @click="emit('open', entry)"
        />

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

      <!-- Been here before. The count is what makes it worth showing: "done
           once" and "done thirty times" are different recommendations. -->
      <p v-if="entry.attendedCount" class="mt-1 flex items-center gap-1 text-xs text-muted">
        <UIcon name="i-lucide-rotate-ccw" class="size-3.5 shrink-0 text-primary" />
        <span>
          You have done this
          {{ entry.attendedCount === 1 ? 'once' : `${entry.attendedCount} times` }}
        </span>
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

    <div class="flex shrink-0 items-center gap-1.5">
      <!-- Right-aligned: people who tend to be at the club around now, which
           is a weaker signal than a booking and should not compete with it. -->
      <UPopover v-if="showAround && entry.around.length" mode="hover">
        <UButton
          :label="String(entry.around.length)"
          icon="i-lucide-user-round-check"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`${entry.around.length} usually here around now`"
        />

        <template #content>
          <div class="max-w-72 p-3">
            <p class="mb-2 text-sm font-medium">
              Usually here around now
            </p>
            <ul class="space-y-1.5">
              <li
                v-for="person in entry.around"
                :key="person.contactId"
                class="flex items-baseline justify-between gap-3 text-sm"
              >
                <span class="truncate">{{ person.name }}</span>
                <span class="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {{ person.arrived }}–{{ person.left }}
                </span>
              </li>
            </ul>
            <p class="mt-2 text-xs text-dimmed">
              From when they were in on this day previously — they are not
              booked onto this class.
            </p>
          </div>
        </template>
      </UPopover>

      <!-- Booking for someone who asked you to. Its own control rather than a
           split button: the two act on different people, and a menu that can
           change what the adjacent button does is how you book the wrong
           person onto a 6am class. -->
      <UDropdownMenu v-if="buddyItems.length" :items="buddyItems">
        <UButton
          icon="i-lucide-users-round"
          :color="entry.bookedFor.length ? 'primary' : 'neutral'"
          :variant="entry.bookedFor.length ? 'soft' : 'ghost'"
          :loading="pending"
          size="sm"
          :aria-label="`Book someone else onto ${entry.name}`"
        />
      </UDropdownMenu>

      <!-- Only on your own waiting-list places. A space at KAL goes to
           whoever books first, so this is the difference between getting it
           and reading about it. -->
      <UTooltip
        v-if="entry.queued && !entry.finished && !entry.isCancelled"
        :text="autoAccept ? 'Auto-accept is on — KAL Pal will book a space as soon as one opens' : 'Auto-accept a space if one opens'"
      >
        <UButton
          :icon="autoAccept ? 'i-lucide-zap' : 'i-lucide-zap-off'"
          :label="autoAccept ? 'Auto-accept' : undefined"
          :color="autoAccept ? 'primary' : 'neutral'"
          :variant="autoAccept ? 'soft' : 'ghost'"
          :loading="savingAutoAccept"
          size="sm"
          :aria-pressed="autoAccept"
          :aria-label="`Auto-accept a space on ${entry.name}`"
          @click="toggleAutoAccept"
        />
      </UTooltip>

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
