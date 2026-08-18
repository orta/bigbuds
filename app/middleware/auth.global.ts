/**
 * Everything needs a BigBox login except the login page itself.
 *
 * Global rather than per-page: this app has nothing to show a stranger, so
 * opting pages *out* is the safer default than remembering to opt each new one
 * in.
 */

const PUBLIC = new Set(['/login'])

export default defineNuxtRouteMiddleware(to => {
  const { loggedIn } = useUserSession()

  if (PUBLIC.has(to.path)) {
    // Signing in again when already signed in just means going home.
    return loggedIn.value ? navigateTo('/') : undefined
  }

  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } })
  }
})
