/**
 * Whether this deployment can send notifications, and the key to subscribe with.
 *
 * An endpoint rather than `runtimeConfig.public` so the whole feature is
 * configured by one family of `BIGBUDS_*` variables, rather than having the
 * public half of the pair renamed to `NUXT_PUBLIC_*` to satisfy the framework.
 *
 * The key is public by design — it identifies the application to the push
 * service and is sent to every subscribing browser. It is behind the session
 * only because everything else in `/api` is.
 */

import { pushPublicKey } from '../../utils/push'
import { requireMember } from '../../utils/session'

export default defineEventHandler(async event => {
  await requireMember(event)

  const publicKey = pushPublicKey()
  return { enabled: publicKey !== null, publicKey }
})
