/**
 * BigBuds' service worker.
 *
 * It exists for one reason: a push message can only be delivered to a service
 * worker, so there has to be one even though this app has nothing it wants to
 * cache. That is why it is a hand-written file in `public/` rather than a
 * generated one — there is no offline strategy here to configure, and a PWA
 * toolchain would bring a build step, a precache manifest and a set of
 * decisions about stale content for a file that handles two events.
 *
 * It is served from the origin root, which is what gives it a scope covering
 * the whole app.
 */

/**
 * Take over without waiting for every tab to close.
 *
 * Notifications are the only thing this does, so an old copy lingering is
 * pure downside: a member turns them on, and the worker that would have shown
 * them is the previous version until they close every tab they have open.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

/**
 * A push arrived.
 *
 * The browser requires that a notification is actually shown — a push handler
 * that shows nothing gets the app's permission revoked after a few offences —
 * so the fallback text is not politeness, it is the thing that stops a
 * malformed payload from quietly costing every member their notifications.
 */
self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Fall through to the defaults below.
  }

  const title = payload.title || 'BigBuds'
  const options = {
    body: payload.body || 'Something changed with one of your classes.',
    icon: '/icon-192.png',
    // The small monochrome mark Android puts in the status bar.
    badge: '/badge.png',
    // Replaces rather than stacks — see `PushPayload.tag`.
    tag: payload.tag || 'bigbuds',
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/bookings' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Tapped.
 *
 * Focuses a tab that already has the app open rather than adding another,
 * which is what you want on a phone where the app is installed: tapping the
 * notification should land you in the app you already have, on the page the
 * message was about.
 */
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || '/bookings', self.location.origin)

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    for (const client of clients) {
      if (new URL(client.url).origin !== target.origin) continue
      await client.focus()
      // `navigate` is not available to every client; focusing is the part
      // that matters, so a failure here is not worth surfacing.
      if ('navigate' in client) await client.navigate(target.href).catch(() => {})
      return
    }

    await self.clients.openWindow(target.href)
  })())
})
