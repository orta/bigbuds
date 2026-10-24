<script setup lang="ts">
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'
import type { Visit } from '#shared/visits'
import { describeDuration, usualPattern } from '#shared/visits'

useHead({ title: 'People · KAL Pal' })

const today = clubToday()
const tomorrow = addDays(today, 1)

const toast = useToast()
const { user, fetch: refreshSession } = useUserSession()

const { data, status, refresh } = await useFetch('/api/people')
const members = computed(() => data.value?.members ?? [])

/**
 * Who this member lets book for them, held locally so the switch moves at
 * once. The session's copy is the truth, and is what a failed save reverts to.
 */
const granted = ref(new Set(user.value?.bookableBy ?? []))
const saving = ref<string | null>(null)

/**
 * Grants or revokes one person's right to book this member onto classes.
 *
 * Sent as the whole list rather than as an add/remove, because that is what
 * the settings endpoint stores and a diff would be a second way to describe
 * the same thing.
 */
async function setCanBookYou(member: { contactId: string, name: string }, allowed: boolean) {
  const before = new Set(granted.value)

  if (allowed) granted.value.add(member.contactId)
  else granted.value.delete(member.contactId)
  triggerRef(granted)

  saving.value = member.contactId
  try {
    await $fetch('/api/me', {
      method: 'PATCH',
      body: { bookableBy: [...granted.value] },
    })
    await Promise.all([refreshSession(), refresh()])
    toast.add({
      title: allowed
        ? `${member.name} can now book you into classes`
        : `${member.name} can no longer book you in`,
      description: allowed
        ? 'They can also cancel what they booked, and see what you are booked onto.'
        : undefined,
      icon: allowed ? 'i-lucide-user-check' : 'i-lucide-user-x',
      color: 'neutral',
    })
  } catch {
    granted.value = before
    toast.add({
      title: 'Could not change that',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  } finally {
    saving.value = null
  }
}

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
      Everyone using KAL Pal who has left themselves visible. Their booked
      classes show up against the timetable as you browse it, and you can let
      any of them book classes for you.
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

        <!-- Booking for each other, which only exists once somebody says so. -->
        <div v-if="!member.isYou" class="mt-3 flex items-center gap-3 border-t border-default pt-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              Let {{ member.name.split(' ')[0] }} book me in
            </p>
            <p class="text-xs text-muted">
              <template v-if="member.youCanBook">
                They have let you book for them — their classes have a
                <span class="font-medium">book for</span> menu on the timetable.
              </template>
              <template v-else>
                They will be able to book and cancel classes on your KAL
                account.
              </template>
            </p>
          </div>
          <USwitch
            :model-value="granted.has(member.contactId)"
            :loading="saving === member.contactId"
            :aria-label="`Let ${member.name} book you into classes`"
            @update:model-value="allowed => setCanBookYou(member, allowed)"
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
