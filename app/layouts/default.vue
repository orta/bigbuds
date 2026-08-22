<script setup lang="ts">
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'

interface Promotion {
  classEventId: string
  name: string
  startedAt: string
}

const { user, loggedIn, clear } = useUserSession()
const route = useRoute()

const links = [
  { label: 'Timetable', to: '/', icon: 'i-lucide-calendar-days' },
  { label: 'My classes', to: '/bookings', icon: 'i-lucide-check-circle-2' },
  { label: 'People', to: '/people', icon: 'i-lucide-users' },
]

const today = clubToday()
const tomorrow = addDays(today, 1)

/**
 * Waiting-list places the club has given this member since they last looked.
 *
 * In the layout rather than on one page, because the club promotes while
 * nobody is watching and there is no telling where somebody will come back in.
 * Whatever page they open should be the one that tells them.
 */
const { data: news, refresh: refreshPromotions } = await useFetch<{ promotions: Promotion[] }>(
  '/api/promotions',
  // Nothing to ask about for somebody who is not signed in, and asking would
  // be a 401 on the login page.
  { immediate: loggedIn.value, default: () => ({ promotions: [] }) },
)

const promotions = computed(() => news.value?.promotions ?? [])
const dismissing = ref(false)

async function dismiss() {
  dismissing.value = true
  try {
    await $fetch('/api/promotions/seen', { method: 'POST' })
    await refreshPromotions()
  } finally {
    dismissing.value = false
  }
}

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <header
      v-if="loggedIn"
      class="sticky top-0 z-20 border-b border-default bg-default/85 backdrop-blur"
    >
      <div class="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
        <NuxtLink to="/" class="mr-auto flex items-center gap-2 font-semibold tracking-tight">
          <UIcon name="i-lucide-boxes" class="size-5 text-primary" />
          BigBuds
        </NuxtLink>

        <nav class="flex items-center gap-1">
          <UButton
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :icon="link.icon"
            :label="link.label"
            :color="route.path === link.to ? 'primary' : 'neutral'"
            :variant="route.path === link.to ? 'soft' : 'ghost'"
            size="sm"
            class="max-sm:*:last:hidden"
          />
        </nav>

        <UDropdownMenu
          :items="[[
            { label: user?.name || 'Signed in', type: 'label' },
            { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
            { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut },
          ]]"
        >
          <UButton
            :label="user?.givenName"
            icon="i-lucide-user"
            color="neutral"
            variant="ghost"
            size="sm"
            class="max-sm:*:last:hidden"
          />
        </UDropdownMenu>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-6">
      <!-- The one thing the club does silently, said out loud. Dismissed by
           hand rather than by having been rendered — see the seen endpoint. -->
      <UAlert
        v-if="promotions.length"
        icon="i-lucide-party-popper"
        color="success"
        variant="subtle"
        class="mb-5"
        :title="promotions.length === 1
          ? `You are off the waiting list for ${promotions[0]!.name}`
          : `You are off the waiting list for ${promotions.length} classes`"
        :close="{ color: 'success', variant: 'ghost', loading: dismissing }"
        @update:open="dismiss"
      >
        <template #description>
          <ul class="space-y-0.5">
            <li v-for="promotion in promotions" :key="promotion.classEventId">
              <span class="font-medium">{{ promotion.name }}</span>
              — {{ whenLabel(promotion.startedAt, today, tomorrow) }}
            </li>
          </ul>
          <NuxtLink to="/bookings" class="mt-1 inline-block underline underline-offset-2">
            See it with your other classes
          </NuxtLink>
        </template>
      </UAlert>

      <slot />
    </main>
  </div>
</template>
