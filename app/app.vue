<script setup lang="ts">
/**
 * The absolute URLs a link preview needs.
 *
 * Open Graph wants absolute URLs, and this app has no configured domain — it
 * is whatever Railway called the deployment. Rather than an environment
 * variable that will be wrong the first time it moves, the origin is taken
 * from the request that is being rendered.
 *
 * `useServerHead`, because the only readers are the scrapers behind a chat
 * app's link preview, and none of them run the client bundle.
 */
const { origin } = useRequestURL()

useServerHead({
  meta: [
    { property: 'og:url', content: origin },
    { property: 'og:image', content: `${origin}/og-image.png` },
    { name: 'twitter:image', content: `${origin}/og-image.png` },
  ],
})
</script>

<template>
  <UApp>
    <!-- The thin bar along the top while a page is still on its way. The three
         main tabs now show themselves before their data arrives, so this is
         mostly for Settings, whose fetches still block, and for a slow first
         load of a page's code. -->
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
