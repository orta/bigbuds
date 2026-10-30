<script setup lang="ts">
/**
 * One class, opened.
 *
 * The timetable row is deliberately terse — there are sixty of them in a day
 * and they have to be scannable — so everything the API knows about a class
 * that does not fit on a row lives here, alongside what members have written
 * about it.
 *
 * Rendered once per page and handed whichever class is open, rather than one
 * of these inside every card: the notes are fetched on open, and sixty cards
 * each holding their own idle request would be sixty of them.
 */

import type { ClassNotes, ClassRow } from '#shared/types'
import { agoLabel, dayLabel, placesText, timeRange } from '#shared/format'
import { naiveDate } from '#shared/naive'

const entry = defineModel<ClassRow | null>({ required: true })

const NOTE_MAX_LENGTH = 500

const toast = useToast()

const open = computed({
  get: () => entry.value !== null,
  // Only ever set to false, by the modal closing itself.
  set: (value: boolean) => { if (!value) entry.value = null },
})

const activityId = computed(() => entry.value?.activityId ?? null)

const { data, status, execute, clear } = await useFetch<ClassNotes>('/api/classes/notes', {
  query: { activityId },
  immediate: false,
  // Fetched by the watcher below instead, so it happens on open rather than
  // on every change to whichever class the page last had selected.
  watch: false,
})

/** The text in the box, which is the member's own note until they save it. */
const draft = ref('')
const saving = ref(false)

watch(entry, async current => {
  if (!current) return

  // A class the club has no activity id for — rare, but it means there is
  // nothing to key a note to, so the section does not appear at all.
  if (!current.activityId) {
    clear()
    draft.value = ''
    return
  }

  await execute()
  draft.value = data.value?.yours ?? ''
})

const yours = computed(() => data.value?.yours ?? null)
const others = computed(() => data.value?.others ?? [])
const dirty = computed(() => draft.value.trim() !== (yours.value ?? ''))
const remaining = computed(() => NOTE_MAX_LENGTH - draft.value.trim().length)

async function save() {
  if (!activityId.value) return

  saving.value = true
  try {
    const removing = !draft.value.trim()

    data.value = await $fetch<ClassNotes>('/api/classes/notes', {
      method: 'PUT',
      body: { activityId: activityId.value, text: draft.value },
    })

    // What came back is what was stored — trimmed, and truncated if it ran
    // long — so the box shows that rather than what was typed.
    draft.value = data.value.yours ?? ''

    toast.add({
      title: removing ? 'Your note has been removed' : 'Note saved',
      description: removing ? undefined : 'Other members can see it on this class.',
      icon: removing ? 'i-lucide-trash-2' : 'i-lucide-check',
      color: 'neutral',
    })
  } catch {
    toast.add({
      title: 'Could not save that note',
      description: 'Please try again.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    saving.value = false
  }
}

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase()

/** The same star as on the row, for somebody who opened the class first. */
const favourites = useFavourites()
const favourite = computed(() => (entry.value ? favourites.has(entry.value) : false))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="entry?.name ?? ''"
    :description="entry?.start
      ? `${dayLabel(naiveDate(entry.start))} · ${timeRange(entry.start, entry.durationMinutes)}`
      : ''"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div v-if="entry" class="space-y-5">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <UBadge :label="entry.categoryLabel" color="neutral" variant="subtle" size="sm" />
          <span v-if="entry.coach">{{ entry.coach }}</span>
          <span v-if="entry.coach && entry.studio">·</span>
          <span v-if="entry.studio">{{ entry.studio }}</span>
          <span v-if="placesText(entry)">·</span>
          <span v-if="placesText(entry)">{{ placesText(entry) }}</span>

          <UButton
            v-if="entry.activityId"
            :label="favourite ? 'Favourite' : 'Add to favourites'"
            :color="favourite ? 'primary' : 'neutral'"
            :variant="favourite ? 'soft' : 'outline'"
            size="xs"
            class="ml-auto"
            :aria-pressed="favourite"
            @click="favourites.toggle(entry)"
          >
            <template #leading>
              <UIcon name="i-lucide-star" mode="svg" class="size-4" :class="favourite ? 'fill-current' : ''" />
            </template>
          </UButton>
        </div>

        <!-- The club's own words. Kept apart from the notes below it, which
             are members', because the two are different kinds of claim. -->
        <p v-if="entry.description" class="text-sm leading-relaxed text-toned">
          {{ entry.description }}
        </p>
        <p v-else class="text-sm italic text-dimmed">
          The club has not written a description for this class.
        </p>

        <div v-if="entry.tags.length" class="flex flex-wrap gap-1">
          <UBadge
            v-for="tag in entry.tags"
            :key="tag"
            :label="tag"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </div>

        <p v-if="entry.attendedCount" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-rotate-ccw" class="size-4 shrink-0 text-primary" />
          <span>
            You have done this
            {{ entry.attendedCount === 1 ? 'once' : `${entry.attendedCount} times` }}<template
              v-if="entry.attendedLast"
            >, most recently
              {{ dayLabel(naiveDate(entry.attendedLast)) }}</template>
          </span>
        </p>

        <USeparator v-if="entry.activityId" />

        <!-- Notes. Only for a class the club gives an activity id, because
             that is what a note is keyed to. -->
        <div v-if="entry.activityId" class="space-y-4">
          <div>
            <h3 class="text-sm font-medium">
              Your note
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              What you wish you had known before your first one. Everyone signed
              into KAL Pal sees this against your name, on every
              {{ entry.name }}.
            </p>

            <UTextarea
              v-model="draft"
              :rows="3"
              :maxrows="8"
              autoresize
              :disabled="status === 'pending'"
              placeholder="Bring grip socks. The 06:30 fills up from the front row back."
              class="mt-2 w-full"
            />

            <div class="mt-2 flex items-center gap-2">
              <UButton
                :label="!draft.trim() && yours ? 'Remove note' : 'Save note'"
                :color="!draft.trim() && yours ? 'neutral' : 'primary'"
                :variant="!draft.trim() && yours ? 'outline' : 'solid'"
                size="xs"
                :loading="saving"
                :disabled="!dirty"
                @click="save"
              />
              <span
                v-if="remaining < 100"
                class="text-xs tabular-nums"
                :class="remaining < 0 ? 'text-error' : 'text-dimmed'"
              >
                {{ remaining }} left
              </span>
            </div>
          </div>

          <div v-if="status === 'pending'" class="space-y-2">
            <USkeleton class="h-12 w-full" />
          </div>

          <div v-else-if="others.length" class="space-y-3">
            <h3 class="text-sm font-medium">
              From other members
            </h3>
            <div
              v-for="note in others"
              :key="note.contactId"
              class="rounded-lg border border-default bg-elevated/40 p-3"
            >
              <div class="mb-1 flex items-baseline gap-2">
                <UAvatar :text="initials(note.name)" :alt="note.name" size="2xs" />
                <span class="text-sm font-medium">{{ note.name }}</span>
                <span class="text-xs text-dimmed">{{ agoLabel(note.updatedAt) }}</span>
              </div>
              <p class="whitespace-pre-line text-sm leading-relaxed text-toned">
                {{ note.text }}
              </p>
            </div>
          </div>

          <p v-else-if="!yours" class="text-sm text-dimmed">
            Nobody has written about this class yet.
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
