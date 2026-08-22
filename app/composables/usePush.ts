/**
 * The browser half of notifications.
 *
 * Three separate pieces of state get conflated constantly and are kept apart
 * here, because the difference is what the settings page has to explain:
 *
 * - **supported** — this browser can do push at all. Safari on iOS cannot,
 *   unless the app has been added to the home screen, which is a thing only
 *   the member can do and which no API will report having happened.
 * - **permission** — the member has been asked and said yes. Browser-wide,
 *   survives sign-out, and once it is `denied` this app cannot ask again;
 *   only the member can undo it, in browser settings.
 * - **subscribed** — there is a live subscription registered with the server.
 *   This is the one the switch reflects, and it is the only one the app can
 *   actually change.
 */

interface PushConfig {
  enabled: boolean
  publicKey: string | null
}

/**
 * The VAPID key as the `applicationServerKey` argument wants it.
 *
 * It travels as base64url and has to arrive as bytes. The padding is put back
 * by hand because `atob` insists on it and base64url leaves it off, and the
 * array is built over an `ArrayBuffer` this function allocated — `subscribe`
 * takes a `BufferSource`, which a `Uint8Array` that might be backed by a
 * `SharedArrayBuffer` is not.
 */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))

  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

  return bytes
}

export function usePush() {
  const toast = useToast()

  const supported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const subscribed = ref(false)
  const configured = ref(false)
  const busy = ref(false)

  let publicKey: string | null = null

  /** The app's service worker, registered on demand rather than at page load. */
  async function worker(): Promise<ServiceWorkerRegistration> {
    // `ready` alone would hang forever on a page that has never registered
    // one, so register first — it resolves to the existing registration if
    // there already is one.
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return navigator.serviceWorker.ready
  }

  /**
   * Works out where things stand.
   *
   * Asks the browser rather than trusting the server's list: a subscription
   * can be dropped at the browser's end — site data cleared, app reinstalled —
   * without anything telling us, and a switch showing "on" for a device that
   * will never receive anything is the failure this feature can least afford.
   */
  async function refresh() {
    if (!import.meta.client) return

    supported.value = 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window

    if (!supported.value) return

    permission.value = Notification.permission

    const config = await $fetch<PushConfig>('/api/push/config').catch(() => null)
    configured.value = Boolean(config?.enabled)
    publicKey = config?.publicKey ?? null

    if (permission.value !== 'granted') {
      subscribed.value = false
      return
    }

    const registration = await navigator.serviceWorker.getRegistration('/')
    subscribed.value = Boolean(await registration?.pushManager.getSubscription())
  }

  async function enable(): Promise<boolean> {
    if (!supported.value || !publicKey) return false

    busy.value = true
    try {
      permission.value = await Notification.requestPermission()

      if (permission.value !== 'granted') {
        toast.add({
          title: 'Notifications are blocked',
          description: permission.value === 'denied'
            ? 'Your browser is refusing them for this site — the setting is in its own preferences, not here.'
            : 'Nothing was changed.',
          color: 'warning',
          icon: 'i-lucide-bell-off',
        })
        return false
      }

      const registration = await worker()
      const subscription = await registration.pushManager.subscribe({
        // Required to be true, and honestly meant: every message this app
        // sends is shown to the member. There is no silent push here.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      })

      await $fetch('/api/push/subscribe', {
        method: 'POST',
        body: subscription.toJSON(),
      })

      subscribed.value = true
      return true
    } catch (error) {
      console.error('[push] could not subscribe', error)
      toast.add({
        title: 'Could not turn notifications on',
        description: 'Your browser refused the subscription. Please try again.',
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
      return false
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<boolean> {
    busy.value = true
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription) {
        // The server first: if this half fails, the browser subscription is
        // still live and the switch can be turned off again. The other order
        // would leave the server sending to an endpoint nothing listens on.
        await $fetch('/api/push/subscribe', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        })
        await subscription.unsubscribe()
      }

      subscribed.value = false
      return true
    } catch (error) {
      console.error('[push] could not unsubscribe', error)
      toast.add({
        title: 'Could not turn notifications off',
        description: 'Please try again.',
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
      return false
    } finally {
      busy.value = false
    }
  }

  onMounted(refresh)

  return { supported, permission, subscribed, configured, busy, enable, disable, refresh }
}
