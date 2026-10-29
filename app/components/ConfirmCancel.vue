<script setup lang="ts">
/**
 * "Are you sure?" before a place is given up.
 *
 * Cancelling used to happen on the first tap. On a waiting-list row that
 * button sits beside the auto-accept toggle, and a member reaching for "tell me
 * when a space opens" lost their place in the queue instead — which, since
 * joining again puts you at the back, is the one mistake in the app that
 * cannot be undone. So every cancellation now goes through here first.
 *
 * Opened programmatically by `useConfirmCancel`; `close` carries the answer.
 */
defineProps<{
  /** The class, as the row shows it. */
  name: string
  /** `Today at 18:30`; empty when the class has no start time. */
  when: string
  /** A waiting-list place rather than a booking — leaving it loses the queue position. */
  queued: boolean
  /** Whose place it is, when it is not the member's own. */
  forName?: string
}>()

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="queued
      ? (forName ? `Take ${forName} off the list for ${name}?` : `Leave the waiting list for ${name}?`)
      : (forName ? `Cancel ${name} for ${forName}?` : `Cancel ${name}?`)"
    :description="[
      when,
      queued
        ? 'Leaving gives up the place in the queue. Joining again starts from the back.'
        : 'The place goes back to the club. If anyone is waiting, it goes to whoever books first.',
    ].filter(Boolean).join('. ')"
    :close="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        label="Keep it"
        color="neutral"
        variant="outline"
        @click="emit('close', false)"
      />
      <UButton
        :label="queued ? 'Leave the list' : 'Cancel the booking'"
        color="error"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
