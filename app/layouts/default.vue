<script setup lang="ts">
const { user, loggedIn, clear } = useUserSession()
const route = useRoute()

const links = [
  { label: 'Timetable', to: '/', icon: 'i-lucide-calendar-days' },
  { label: 'My classes', to: '/bookings', icon: 'i-lucide-check-circle-2' },
  { label: 'People', to: '/people', icon: 'i-lucide-users' },
]

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
      <slot />
    </main>
  </div>
</template>
