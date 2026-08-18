<script setup lang="ts">
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'

useHead({ title: 'People · BigBuds' })

const today = clubToday()
const tomorrow = addDays(today, 1)

const { data, status } = await useFetch('/api/people')
const members = computed(() => data.value?.members ?? [])

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase()
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
      <USkeleton v-for="n in 4" :key="n" class="h-14 w-full" />
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
        class="flex items-center gap-3 rounded-lg border border-default bg-elevated/40 p-3"
      >
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
    </div>
  </div>
</template>
