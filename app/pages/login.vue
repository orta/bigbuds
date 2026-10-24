<script setup lang="ts">
definePageMeta({ layout: false })

/**
 * KAL's own web portal, for checking a login before trusting it to us. The
 * club's app and this portal both sit on the same Gladstone account, so a
 * password that works there works here — and the portal is also where a
 * forgotten one gets reset.
 */
const KAL_PORTAL = 'https://kal.gs-signature.cloud/Connect/mrmLogin.aspx'

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
          KAL Pal
        </h1>
        <p class="mt-1 text-sm text-muted">
          Book KAL classes, and see who else is going.
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
        Use your Kirklees Active Leisure login — the same one as the KAL app.
        We sign in on your behalf to book classes and to keep your schedule
        visible to other members.
      </p>

      <p class="mt-3 text-center text-xs text-muted">
        Not sure of your details?
        <a
          :href="KAL_PORTAL"
          target="_blank"
          rel="noopener"
          class="text-primary underline underline-offset-2"
        >Try them on the KAL website</a>,
        where you can also reset a forgotten password.
      </p>
    </div>
  </div>
</template>
