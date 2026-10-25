<script setup lang="ts">
useHead({ title: 'Settings · KAL Pal' })

const { user, fetch: refreshSession, clear } = useUserSession()
const toast = useToast()

const visible = ref(user.value?.visible ?? true)
const shareEntries = ref(user.value?.shareEntries ?? true)
const saving = ref(false)

/**
 * Who this member has let book for them.
 *
 * Read from the server rather than from the session's list of ids, because
 * this is the one place the names have to appear even for somebody who has
 * since hidden themselves from the People page — otherwise a permission could
 * be held by a name the member can no longer see, and never withdrawn.
 */
const { data: people, refresh: refreshPeople } = await useFetch('/api/people')
const canBookYou = computed(() => people.value?.canBookYou ?? [])
const revoking = ref<string | null>(null)

async function revoke(person: { contactId: string, name: string }) {
  revoking.value = person.contactId
  try {
    await $fetch('/api/me', {
      method: 'PATCH',
      body: {
        bookableBy: canBookYou.value
          .filter(other => other.contactId !== person.contactId)
          .map(other => other.contactId),
      },
    })
    await Promise.all([refreshSession(), refreshPeople()])
    toast.add({
      title: `${person.name} can no longer book you in`,
      icon: 'i-lucide-user-x',
      color: 'neutral',
    })
  } catch {
    toast.add({ title: 'Could not save that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    revoking.value = null
  }
}

async function save(
  field: 'visible' | 'shareEntries',
  next: boolean,
  message: { on: string, off: string },
) {
  saving.value = true
  try {
    await $fetch('/api/me', { method: 'PATCH', body: { [field]: next } })
    await refreshSession()
    toast.add({
      title: next ? message.on : message.off,
      icon: next ? 'i-lucide-eye' : 'i-lucide-eye-off',
      color: 'neutral',
    })
  } catch {
    // Put the switch back where it was: leaving it showing a setting that did
    // not save is worse than the failure itself.
    const revert = field === 'visible' ? visible : shareEntries
    revert.value = !next
    toast.add({ title: 'Could not save that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    saving.value = false
  }
}

const saveVisible = (next: boolean) => save('visible', next, {
  on: 'Your classes are visible to other members',
  off: 'Your classes are hidden',
})

const saveEntries = (next: boolean) => save('shareEntries', next, {
  on: 'Your gym hours are visible to other members',
  off: 'Your gym hours are hidden, and what was recorded has been deleted',
})

// --- Sites ---

/**
 * Which KAL centres the timetable draws from.
 *
 * Saved on every tick rather than with a button, like the switches above.
 * The last ticked centre cannot be unticked: a timetable with no centres is
 * an empty page that looks like the club has cancelled everything.
 */
const { data: siteData } = await useFetch('/api/sites')
const chosenSites = ref(new Set<string>(siteData.value?.chosen ?? []))
const savingSites = ref(false)

async function toggleSite(id: string, on: boolean) {
  const previous = new Set(chosenSites.value)
  const next = new Set(previous)
  if (on) next.add(id)
  else next.delete(id)
  if (!next.size) return

  chosenSites.value = next
  savingSites.value = true
  try {
    await $fetch('/api/me', { method: 'PATCH', body: { sites: [...next] } })
    await refreshSession()
  } catch {
    chosenSites.value = previous
    toast.add({ title: 'Could not save that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    savingSites.value = false
  }
}

// --- Notifications ---

const push = usePush()

/**
 * The switch's own state, so it can be moved back if the browser refuses.
 *
 * Kept in step with what `usePush` found rather than being the source of
 * truth: the browser is, and it can drop a subscription without telling us.
 */
const notify = ref(false)
watch(() => push.subscribed.value, next => { notify.value = next }, { immediate: true })

async function saveNotify(next: boolean) {
  const ok = next ? await push.enable() : await push.disable()

  if (!ok) {
    notify.value = !next
    return
  }

  toast.add({
    title: next
      ? 'You will be told when a place comes up'
      : 'Notifications are off on this device',
    icon: next ? 'i-lucide-bell' : 'i-lucide-bell-off',
    color: 'neutral',
  })
}

const testing = ref(false)

async function sendTest() {
  testing.value = true
  try {
    const { sent } = await $fetch('/api/push/test', { method: 'POST' })
    toast.add(sent
      ? {
          title: `Sent to ${sent === 1 ? 'one device' : `${sent} devices`}`,
          description: 'If nothing appears, check this device is not in Do Not Disturb or Focus.',
          icon: 'i-lucide-send',
          color: 'neutral',
        }
      : {
          title: 'No devices to send to',
          description: 'Turn notifications off and on again on this device.',
          icon: 'i-lucide-bell-off',
          color: 'warning',
        })
  } catch {
    toast.add({ title: 'Could not send that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    testing.value = false
  }
}

// --- Calendar ---

const { data: calendar, refresh: refreshCalendar } = await useFetch<{ path: string | null }>(
  '/api/me/calendar',
)

const calendarBusy = ref(false)

/**
 * The absolute URL to hand a calendar app, taken from the browser's own
 * origin rather than from a configured domain — which would be wrong the first
 * time this deployment moved, and wrong in development always.
 */
const calendarUrl = computed(() => {
  const path = calendar.value?.path
  if (!path || !import.meta.client) return null
  return `${window.location.origin}${path}`
})

/** The same thing as a `webcal:`, which is what makes a phone offer to subscribe. */
const webcalUrl = computed(() => calendarUrl.value?.replace(/^https?:/, 'webcal:') ?? null)

async function issueCalendar() {
  calendarBusy.value = true
  try {
    await $fetch('/api/me/calendar', { method: 'POST' })
    await refreshCalendar()
  } catch {
    toast.add({ title: 'Could not set that up', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    calendarBusy.value = false
  }
}

async function revokeCalendar() {
  calendarBusy.value = true
  try {
    await $fetch('/api/me/calendar', { method: 'DELETE' })
    await refreshCalendar()
    toast.add({
      title: 'That calendar link no longer works',
      description: 'Anything subscribed to it will stop updating.',
      icon: 'i-lucide-link-2-off',
      color: 'neutral',
    })
  } catch {
    toast.add({ title: 'Could not do that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    calendarBusy.value = false
  }
}

async function copyCalendar() {
  if (!calendarUrl.value) return

  try {
    await navigator.clipboard.writeText(calendarUrl.value)
    toast.add({ title: 'Copied', icon: 'i-lucide-clipboard-check', color: 'neutral' })
  } catch {
    toast.add({
      title: 'Could not copy that',
      description: 'Select the link and copy it by hand.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
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
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        Settings
      </h1>
      <p class="text-sm text-muted">
        Signed in as {{ user?.name }} ({{ user?.membershipNumber }}).
      </p>
    </div>

    <UCard v-if="siteData?.sites.length">
      <h2 class="font-medium">
        Which centres to show
      </h2>
      <p class="mt-1 text-sm text-muted">
        The timetable shows classes from every centre you tick, side by side,
        each marked with where it is. Your bookings show wherever they are,
        whatever you pick here.
      </p>

      <ul class="mt-4 grid gap-2 sm:grid-cols-2">
        <li v-for="site in siteData.sites" :key="site.id">
          <UCheckbox
            :model-value="chosenSites.has(site.id)"
            :label="site.name"
            :description="site.home ? 'Your home centre' : undefined"
            :disabled="savingSites || (chosenSites.size === 1 && chosenSites.has(site.id))"
            @update:model-value="(on) => toggleSite(site.id, on === true)"
          />
        </li>
      </ul>
    </UCard>

    <UCard>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">
            Show my classes to other members
          </h2>
          <p class="mt-1 text-sm text-muted">
            When this is on, anyone else signed into KAL Pal sees which classes
            you are booked onto. Turn it off and you disappear from their
            timetables immediately — you will still see theirs.
          </p>
        </div>
        <USwitch
          v-model="visible"
          :loading="saving"
          @update:model-value="saveVisible"
        />
      </div>
    </UCard>

    <UCard>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">
            Show when I come and go
          </h2>
          <p class="mt-1 text-sm text-muted">
            KAL Pal keeps the last week of your badge scans at the club's doors,
            so other members can see roughly when you usually train. Turning
            this off stops the scans being collected and deletes the ones
            already held — it does not merely hide them.
          </p>
        </div>
        <USwitch
          v-model="shareEntries"
          :loading="saving"
          @update:model-value="saveEntries"
        />
      </div>
    </UCard>

    <UCard>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">
            Tell me when a class changes without me
          </h2>
          <p class="mt-1 text-sm text-muted">
            Two things, and only these two. When a space opens at a class you
            are on the waiting list for — the club offers it to the whole list
            at once and it goes to whoever books first; KAL Pal checks every
            two minutes. And when somebody you have allowed
            books you into a class or cancels one for you, because a class
            appearing or disappearing in your name is not something to discover
            by turning up.
          </p>
          <p class="mt-2 text-sm text-muted">
            Nothing else is ever sent. You will not be told that a friend
            booked something, or reminded about a class you booked yourself.
          </p>

          <p v-if="!push.configured.value" class="mt-2 text-sm text-warning">
            This server has not been set up to send notifications. You will
            still see it in the app the next time you open it.
          </p>
          <p v-else-if="!push.supported.value" class="mt-2 text-sm text-warning">
            This browser cannot show notifications. On an iPhone, add KAL Pal
            to your home screen first and open it from there.
          </p>
          <p v-else-if="push.permission.value === 'denied'" class="mt-2 text-sm text-warning">
            Your browser is blocking notifications for this site. That switch
            is in its own settings rather than here.
          </p>
          <template v-else-if="notify">
            <p class="mt-2 text-sm text-muted">
              On for this device. A phone and a laptop are separate — turn it on
              wherever you want to hear about it.
            </p>
            <UButton
              label="Send a test"
              icon="i-lucide-send"
              color="neutral"
              variant="outline"
              size="xs"
              class="mt-3"
              :loading="testing"
              @click="sendTest"
            />
          </template>
        </div>
        <USwitch
          v-model="notify"
          :loading="push.busy.value"
          :disabled="!push.configured.value || !push.supported.value
            || push.permission.value === 'denied'"
          @update:model-value="saveNotify"
        />
      </div>
    </UCard>

    <UCard>
      <h2 class="font-medium">
        Your classes in your calendar
      </h2>
      <p class="mt-1 text-sm text-muted">
        A private link your phone or computer can subscribe to, so the classes
        you book turn up alongside everything else you have on. It keeps itself
        up to date — bookings made in the club's own app appear within a few
        minutes, and cancelling anywhere removes it.
      </p>

      <template v-if="calendarUrl">
        <p class="mt-3 text-sm text-muted">
          Treat this link like a password: anyone who has it can see your
          classes, and there is no sign-in step to stop them. Reset it if it
          gets out.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <code
            class="min-w-0 flex-1 truncate rounded-lg border border-default bg-elevated/60 px-3 py-2 text-xs"
          >{{ calendarUrl }}</code>
          <UButton
            label="Copy"
            icon="i-lucide-clipboard"
            color="neutral"
            variant="outline"
            size="xs"
            @click="copyCalendar"
          />
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <UButton
            v-if="webcalUrl"
            label="Subscribe on this device"
            icon="i-lucide-calendar-plus"
            :to="webcalUrl"
            external
            size="xs"
          />
          <UButton
            label="Reset the link"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="xs"
            :loading="calendarBusy"
            @click="issueCalendar"
          />
          <UButton
            label="Turn it off"
            icon="i-lucide-link-2-off"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="calendarBusy"
            @click="revokeCalendar"
          />
        </div>
      </template>

      <UButton
        v-else
        label="Create a calendar link"
        icon="i-lucide-calendar-plus"
        class="mt-3"
        size="sm"
        :loading="calendarBusy"
        @click="issueCalendar"
      />
    </UCard>

    <UCard>
      <h2 class="font-medium">
        Who can book you into classes
      </h2>
      <p class="mt-1 text-sm text-muted">
        Nobody, unless you say so. Anyone you allow can book you onto classes
        and cancel what they booked — the bookings are made on your own KAL
        account, exactly as if you had made them. Turn it on beside a person's
        name on the
        <NuxtLink to="/people" class="text-primary underline underline-offset-2">
          People
        </NuxtLink>
        page.
      </p>

      <ul v-if="canBookYou.length" class="mt-4 space-y-2">
        <li
          v-for="person in canBookYou"
          :key="person.contactId"
          class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2"
        >
          <span class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-user-check" class="size-4 shrink-0 text-primary" />
            <span class="truncate text-sm">{{ person.name }}</span>
          </span>
          <UButton
            label="Remove"
            color="neutral"
            variant="outline"
            size="xs"
            :loading="revoking === person.contactId"
            @click="revoke(person)"
          />
        </li>
      </ul>
    </UCard>

    <UCard>
      <h2 class="font-medium">
        Your KAL login
      </h2>
      <p class="mt-1 text-sm text-muted">
        KAL Pal stores your KAL password, encrypted, so it can refresh your
        schedule in the background — that is what keeps you visible to other
        members between visits. If you change your password at the club, sign
        in here again to reconnect.
      </p>
      <template #footer>
        <UButton
          label="Sign out"
          icon="i-lucide-log-out"
          color="neutral"
          variant="outline"
          @click="signOut"
        />
      </template>
    </UCard>
  </div>
</template>
