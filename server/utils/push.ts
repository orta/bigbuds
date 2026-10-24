/**
 * Web push, for the one thing the app knows and the member does not.
 *
 * The club promotes off its waiting lists silently. KAL Pal notices, because
 * it is already signing in as everybody every two minutes — but noticing
 * is only useful if it can reach somebody who is not looking at the app, and
 * a browser tab that is closed cannot be told anything. That is what this is
 * for, and it is deliberately the *only* thing it is used for. An app that
 * has asked for permission to interrupt you should spend it on news.
 *
 * ## Why `web-push` rather than `node:crypto`
 *
 * Nearly everything else in this project that could have been a dependency was
 * written out by hand — the ICS feed, the favicon encoder — because the format
 * was small and completely specified and a library would only have hidden the
 * interesting parts. This one goes the other way, and the reason is the
 * failure mode rather than the size.
 *
 * A push message is a VAPID JWT plus an RFC 8291 payload: ECDH over P-256,
 * HKDF twice, AES-128-GCM with a particular record framing. All of it is in
 * `node:crypto` and it is perhaps a hundred and fifty lines. But there is no
 * way to test it short of a live push service and a real device, and every way
 * of getting it subtly wrong produces the same symptom: the request is
 * accepted, and the notification never arrives. Silent non-delivery is the
 * worst possible outcome for the feature — a member waits for a message that
 * was never going to come, and nothing anywhere says so. The reference
 * implementation is worth a dependency.
 *
 * ## Configuration
 *
 * Three variables, all optional. Without them this does nothing at all and
 * says so once at boot — the app is fully usable without notifications, and
 * the in-app record of a promotion (`StoredPromotion`) is what makes that
 * true.
 */

import webpush from 'web-push'
import type { Member, StoredPushSubscription } from './store'
import { writeMember } from './store'

export interface PushPayload {
  title: string
  body: string
  /**
   * Collapses repeats: a second notification with the same tag replaces the
   * first rather than stacking. Two syncs noticing the same promotion should
   * not leave two identical messages on a lock screen.
   */
  tag: string
  /** Where to go when it is tapped, relative to the app's origin. */
  url: string
}

interface Vapid {
  subject: string
  publicKey: string
  privateKey: string
}

let configured: Vapid | null | undefined

/**
 * The VAPID details, or null if the deployment has not set them.
 *
 * Resolved once and remembered, including the negative answer, so a
 * deployment without push does not re-read the environment on every sync.
 */
function vapid(): Vapid | null {
  if (configured !== undefined) return configured

  const publicKey = process.env.BIGBUDS_VAPID_PUBLIC_KEY
  const privateKey = process.env.BIGBUDS_VAPID_PRIVATE_KEY
  // A contact address for the push service to use if this app starts
  // misbehaving. The spec wants one; the services mostly do not check.
  const subject = process.env.BIGBUDS_VAPID_SUBJECT || 'mailto:nobody@example.com'

  if (!publicKey || !privateKey) {
    console.warn(
      '[push] BIGBUDS_VAPID_PUBLIC_KEY / BIGBUDS_VAPID_PRIVATE_KEY are not set — '
      + 'notifications are off. Generate a pair with `yarn vapid`.',
    )
    configured = null
    return null
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = { subject, publicKey, privateKey }
  return configured
}

/** Whether this deployment can send anything. The UI asks before offering to. */
export const pushConfigured = (): boolean => vapid() !== null

/** The key the browser needs to subscribe. Public by design; it identifies the app. */
export const pushPublicKey = (): string | null => vapid()?.publicKey ?? null

/** Records a device's subscription, replacing any earlier one for that endpoint. */
export function addSubscription(
  contactId: string,
  subscription: Pick<StoredPushSubscription, 'endpoint' | 'keys'>,
): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    pushSubscriptions: [
      // The endpoint is the device's identity, and a browser reissues the same
      // one for the same installation — so re-subscribing has to replace
      // rather than accumulate, or a phone ends up being sent to four times.
      ...current!.pushSubscriptions.filter(held => held.endpoint !== subscription.endpoint),
      { ...subscription, createdAt: new Date().toISOString() },
    ],
    updatedAt: new Date().toISOString(),
  }))
}

/** Forgets one device. Called when a member turns notifications off. */
export function removeSubscription(contactId: string, endpoint: string): Promise<Member> {
  return writeMember(contactId, current => ({
    ...current!,
    pushSubscriptions: current!.pushSubscriptions.filter(held => held.endpoint !== endpoint),
    updatedAt: new Date().toISOString(),
  }))
}

/**
 * Sends one notification to every device a member has registered.
 *
 * Never throws. This is called from the middle of the scheduled sync, where
 * the job is keeping everybody's bookings current — a push service having a
 * bad afternoon must not cost the member their sync, let alone stop the run
 * before it reaches the next member.
 *
 * Subscriptions the push service rejects as gone are deleted. `404` and `410`
 * are the two ways it says the endpoint is retired — an uninstalled app, a
 * cleared site, a browser rotating its registration — and keeping them would
 * mean a member's file slowly filling with devices that no longer exist.
 */
export async function notify(member: Member, payload: PushPayload): Promise<number> {
  if (!member.pushSubscriptions.length || !vapid()) return 0

  const body = JSON.stringify(payload)
  const dead: string[] = []
  let sent = 0

  for (const subscription of member.pushSubscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        body,
        // A promotion is worth waking a phone for; a class the member has now
        // got a place at is not worth keeping for a day if the device is off.
        { urgency: 'high', TTL: 6 * 60 * 60 },
      )
      sent += 1
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode

      if (status === 404 || status === 410) dead.push(subscription.endpoint)
      else console.error(`[push] ${member.email}: ${status ?? 'failed'}`, error)
    }
  }

  for (const endpoint of dead) await removeSubscription(member.contactId, endpoint)

  return sent
}
