<script setup lang="ts">
useHead({ title: 'Settings · BigBuds' })

const { user, fetch: refreshSession, clear } = useUserSession()
const toast = useToast()

const visible = ref(user.value?.visible ?? true)
const shareEntries = ref(user.value?.shareEntries ?? true)
const saving = ref(false)

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

    <UCard>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">
            Show my classes to other members
          </h2>
          <p class="mt-1 text-sm text-muted">
            When this is on, anyone else signed into BigBuds sees which classes
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
            BigBuds keeps the last week of your badge scans at the club's doors,
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
      <h2 class="font-medium">
        Your BigBox login
      </h2>
      <p class="mt-1 text-sm text-muted">
        BigBuds stores your BigBox password, encrypted, so it can refresh your
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
