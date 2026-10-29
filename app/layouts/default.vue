<script setup lang="ts">
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'
import type { Notice } from '#shared/notices'
import { noticeSentence } from '#shared/notices'

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
 * Things done to this member's bookings that they have not seen yet — a
 * waiting-list promotion, or somebody they allowed booking or cancelling for
 * them.
 *
 * In the layout rather than on one page, because all of these happen while
 * nobody is watching and there is no telling where somebody will come back in.
 * Whatever page they open should be the one that tells them.
 */
const { data: news, refresh: refreshNotices } = await useFetch<{ notices: Notice[] }>(
  '/api/notices',
  // Nothing to ask about for somebody who is not signed in, and asking would
  // be a 401 on the login page.
  { immediate: loggedIn.value, default: () => ({ notices: [] }) },
)

/** Each with its own sentence, from the same place the notification takes it. */
const notices = computed(() => (news.value?.notices ?? []).map(notice => ({
  ...notice,
  ...noticeSentence(notice, whenLabel(notice.startedAt, today, tomorrow)),
})))

const dismissing = ref<string | null>(null)

async function dismiss(classEventId: string) {
  dismissing.value = classEventId
  try {
    await $fetch('/api/notices/seen', { method: 'POST', body: { classEventId } })
    await refreshNotices()
  } finally {
    dismissing.value = null
  }
}

/**
 * Asking for notifications where people will see it.
 *
 * The switch lives in Settings, behind the menu under the member's name, and
 * the news it exists for — a space opening, usually gone within minutes — is
 * worth nothing if nobody found it. So it is offered here once, on whatever
 * page they land on, until they turn it on or say no.
 *
 * Not offered where it cannot work: a server without keys, or a browser that
 * has already been told no (only the member can undo that, in its settings).
 * iPhones get their own message, because Safari only allows notifications to
 * an app opened from the home screen and has no API that would add it there.
 */
const push = usePush()
const promptDismissed = ref(true)
const isIos = ref(false)

onMounted(() => {
  try {
    promptDismissed.value = localStorage.getItem('kalpal:push-prompt') === 'dismissed'
  } catch {
    promptDismissed.value = false
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  isIos.value = /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone
})

const pushPrompt = computed(() => {
  if (!loggedIn.value || promptDismissed.value || !push.configured.value) return null
  if (push.supported.value) {
    if (push.subscribed.value || push.permission.value === 'denied') return null
    return 'enable' as const
  }
  return isIos.value ? 'home-screen' as const : null
})

function dismissPrompt() {
  promptDismissed.value = true
  try {
    localStorage.setItem('kalpal:push-prompt', 'dismissed')
  } catch {
    // Shown again next visit, which is the lesser problem.
  }
  // "Not now" is final for this banner, so say where the switch lives before
  // the only visible way in disappears.
  useToast().add({
    title: 'You can turn this on any time',
    description: 'The switch is in Settings, under your name at the top.',
    icon: 'i-lucide-bell-off',
    color: 'neutral',
  })
}

async function enablePush() {
  if (await push.enable()) {
    useToast().add({
      title: 'You will be told when a space comes up',
      description: 'Settings has a button to send yourself a test.',
      icon: 'i-lucide-bell',
      color: 'success',
    })
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
          KAL Pal
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
      <UAlert
        v-if="pushPrompt === 'enable'"
        class="mb-5"
        icon="i-lucide-bell"
        color="primary"
        variant="subtle"
        title="Get told when a waiting-list space opens"
        description="KAL gives a freed space to whoever books first. A notification on this device is how you get there before everyone else on the list."
        :actions="[
          { label: 'Turn on notifications', loading: push.busy.value, onClick: enablePush },
          { label: 'Not now', color: 'neutral', variant: 'ghost', onClick: dismissPrompt },
        ]"
      />
      <UAlert
        v-else-if="pushPrompt === 'home-screen'"
        class="mb-5"
        icon="i-lucide-smartphone"
        color="primary"
        variant="subtle"
        title="Want a notification when a space opens?"
        description="On iPhone, tap Share → Add to Home Screen, then open KAL Pal from there and turn notifications on."
        :close="{ color: 'neutral', variant: 'ghost' }"
        @update:open="dismissPrompt"
      />

      <!-- What happened while nobody was looking. One per class, each
           dismissed by hand rather than by having been rendered — clearing
           "Sam booked you in" should not also clear a promotion under it. -->
      <div v-if="notices.length" v-auto-animate class="mb-5 space-y-2">
        <UAlert
          v-for="notice in notices"
          :key="notice.classEventId"
          :icon="notice.kind === 'cancelled-for-you' ? 'i-lucide-calendar-x'
            : notice.kind === 'booked-for-you' ? 'i-lucide-user-plus'
              : notice.kind === 'space-available' ? 'i-lucide-ticket'
                : 'i-lucide-party-popper'"
          :color="notice.kind === 'cancelled-for-you' ? 'warning'
            : notice.kind === 'space-available' ? 'info' : 'success'"
          variant="subtle"
          :title="notice.title"
          :description="notice.body"
          :actions="notice.kind === 'cancelled-for-you'
            ? [{ label: 'Find another', to: `/?date=${notice.startedAt.slice(0, 10)}`, color: 'neutral', variant: 'outline', size: 'xs' }]
            : notice.kind === 'space-available'
              ? [{ label: 'Go to the class', to: `/?date=${notice.startedAt.slice(0, 10)}`, color: 'neutral', variant: 'outline', size: 'xs' }]
              : [{ label: 'See it with your other classes', to: '/bookings', color: 'neutral', variant: 'outline', size: 'xs' }]"
          :close="{
            color: 'neutral',
            variant: 'ghost',
            loading: dismissing === notice.classEventId,
          }"
          @update:open="dismiss(notice.classEventId)"
        />
      </div>

      <slot />
    </main>
  </div>
</template>
