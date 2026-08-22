// https://nuxt.com/docs/api/configuration/nuxt-config

/** One sentence, used by the tab, the manifest and the link preview alike. */
const DESCRIPTION = 'Book BigBox classes, and see which of your gym buddies are going.'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@formkit/auto-animate',
    '@nuxtjs/robots',
    'nuxt-auth-utils',
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'BigBuds',
      htmlAttrs: { lang: 'en-GB' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: DESCRIPTION },
        { name: 'application-name', content: 'BigBuds' },

        /**
         * Two, so the browser chrome matches the page rather than the taste of
         * whoever wrote the config: the app follows the system colour scheme,
         * and a fixed near-black bar above a white timetable looks like a bug.
         */
        { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },

        // Added to the home screen, this runs without browser chrome. The
        // status bar is told to be dark rather than translucent, so the
        // sticky header sits below it instead of under it.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'BigBuds' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },

        // The link somebody sends a gym friend is how anyone arrives here, so
        // it gets a card. `app.vue` adds the absolute URLs these need.
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'BigBuds' },
        { property: 'og:title', content: 'BigBuds' },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'BigBuds' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        // `sizes` is what stops a browser preferring the .ico: given the
        // choice it takes the SVG, and falls back to the bitmap that has the
        // hand-tuned small artwork in it.
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

  // Members' schedules are nobody else's business, and there is nothing here
  // for a crawler to index — every page needs a BigBox login.
  robots: { disallow: '/' },

  runtimeConfig: {
    session: {
      // A month. Members check the timetable a few times a week, and being
      // logged out between visits would be the most annoying thing the app does.
      maxAge: 60 * 60 * 24 * 30,
    },
  },

  nitro: {
    experimental: { tasks: true },
    // Keeps everyone's shared bookings roughly current without anyone having
    // to open the app. `server/tasks/sync.ts`.
    scheduledTasks: { '*/15 * * * *': ['sync'] },
  },

  typescript: { typeCheck: false },
})
