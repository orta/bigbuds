<script setup lang="ts">
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'
import type { Visit } from '#shared/visits'
import { describeDuration, usualPattern } from '#shared/visits'

useHead({ title: 'People · BigBuds' })

const today = clubToday()
const tomorrow = addDays(today, 1)

const { data, status } = await useFetch('/api/people')
const members = computed(() => data.value?.members ?? [])

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase()

/**
 * How to describe someone's hours.
 *
 * With at most a week of history, "usually" would be overclaiming from one or
 * two visits, so the wording follows the sample size rather than pretending to
 * a pattern that is not there yet.
 */
function hoursLabel(visits: Visit[]) {
  const pattern = usualPattern(visits)
  if (!pattern) return null

  // Quoting a median across visits that do not cluster would name a time the
  // member was never here, so say so instead.
  if (!pattern.consistent) return 'Comes at varying times'

  const window = pattern.left ? `${pattern.arrived}–${pattern.left}` : `around ${pattern.arrived}`
  return `${pattern.samples >= 3 ? 'Usually here' : 'Came'} ${window}`
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold tracking-tight">
      People
    </h1>
    <p class="mb-5 text-sm text-muted">
      Everyone using BigBuds who has left themselves visible. Their booked
      classes show up against the timetable as you browse it.
    </p>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
    </div>

    <UAlert
      v-else-if="!members.length"
      icon="i-lucide-users"
      color="neutral"
      variant="subtle"
      title="Nobody else yet"
      description="You are the first here. Send a gym friend the link and their classes will start showing up on your timetable."
    />

    <div v-else class="space-y-2">
      <div
        v-for="member in members"
        :key="member.contactId"
        class="rounded-lg border border-default bg-elevated/40 p-3"
      >
        <div class="flex items-center gap-3">
          <UAvatar :text="initials(member.name)" :alt="member.name" />

          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">
              {{ member.name }}
              <UBadge v-if="member.isYou" label="You" size="sm" variant="soft" color="primary" />
            </p>
            <p class="text-sm text-muted">
              <template v-if="member.next">
                Next: {{ whenLabel(member.next, today, tomorrow) }}
              </template>
              <template v-else>
                Nothing booked
              </template>
            </p>
          </div>

          <UBadge
            v-if="member.upcoming"
            :label="`${member.upcoming} upcoming`"
            color="neutral"
            variant="subtle"
          />
        </div>

        <!-- Gym hours, from badge scans at the club's doors. -->
        <div v-if="member.visits.length" class="mt-3 border-t border-default pt-3">
          <p class="mb-2 flex items-center gap-1.5 text-sm">
            <UIcon name="i-lucide-door-open" class="size-4 text-primary" />
            <span class="font-medium">{{ hoursLabel(member.visits) }}</span>
            <span class="text-muted">
              · {{ member.visits.length }}
              {{ member.visits.length === 1 ? 'visit' : 'visits' }} this week
            </span>
          </p>

          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="visit in member.visits.slice().reverse()"
              :key="visit.date + visit.arrived"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="`${visit.arrived}${visit.left ? '–' + visit.left : ''}`"
              :ui="{ label: 'font-mono tabular-nums' }"
              :title="`${visit.date}${visit.minutes ? ' · ' + describeDuration(visit.minutes) : ''}`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
