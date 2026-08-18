<script setup lang="ts">
useHead({ title: 'Settings · BigBuds' })

const { user, fetch: refreshSession, clear } = useUserSession()
const toast = useToast()

const visible = ref(user.value?.visible ?? true)
const saving = ref(false)

async function save(next: boolean) {
  saving.value = true
  try {
    await $fetch('/api/me', { method: 'PATCH', body: { visible: next } })
    await refreshSession()
    toast.add({
      title: next ? 'You are visible to other members' : 'You are hidden',
      description: next
        ? 'Your booked classes show up on other members\' timetables.'
        : 'Nobody can see your classes. You can still see theirs.',
      icon: next ? 'i-lucide-eye' : 'i-lucide-eye-off',
      color: 'neutral',
    })
  } catch {
    visible.value = !next
    toast.add({ title: 'Could not save that', color: 'error', icon: 'i-lucide-alert-circle' })
  } finally {
    saving.value = false
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
          @update:model-value="save"
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
