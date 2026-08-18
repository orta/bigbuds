// https://nuxt.com/docs/api/configuration/nuxt-config
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
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Book BigBox classes and see which of your gym buddies are going.',
        },
        { name: 'theme-color', content: '#0a0a0a' },
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
