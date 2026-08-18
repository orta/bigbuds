<script setup lang="ts">
definePageMeta({ layout: false })

const { fetch: refreshSession } = useUserSession()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  error.value = ''
  pending.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    await refreshSession()
    await navigateTo((route.query.next as string) || '/')
  } catch (cause) {
    const message = (cause as { statusMessage?: string }).statusMessage
    error.value = message || 'Could not sign in. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-default px-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <UIcon name="i-lucide-boxes" class="mx-auto mb-3 size-10 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">
          BigBuds
        </h1>
        <p class="mt-1 text-sm text-muted">
          Book BigBox classes, and see who else is going.
        </p>
      </div>

      <UCard>
        <form class="space-y-4" @submit.prevent="submit">
          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="you@example.com"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="w-full"
              required
            />
          </UFormField>

          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :description="error"
          />

          <UButton
            type="submit"
            label="Sign in"
            block
            size="lg"
            :loading="pending"
          />
        </form>
      </UCard>

      <p class="mt-4 text-center text-xs text-muted">
        Use your BigBox Leisure Club login — the same one as the club's own app.
        We sign in on your behalf to book classes and to keep your schedule
        visible to other members.
      </p>
    </div>
  </div>
</template>
