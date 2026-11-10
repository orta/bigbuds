/**
 * Answers "who am I" from the member's stored record rather than the cookie.
 *
 * The cookie is a snapshot from whenever it was last written, and every
 * browser has its own — on an iPhone the home-screen app keeps its cookies
 * apart from Safari's, so that is two even on one phone. A preference changed
 * in one is still the old value in the others, and the pages seed their
 * filters and stars from the session, so the old value reappears there as if
 * it had never been changed. Worse, the next toggle on that device sends the
 * whole stale list back and overwrites the newer choice in the store.
 *
 * The store is already the truth for the server — `requireMember` re-reads it
 * on every request — and this makes the browser agree. It also heals cookies
 * written before `me.patch.ts` stopped merging arrays into them.
 */

import { findMember } from '../utils/members'
import { sessionUser } from '../utils/session'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async session => {
    if (!session.user?.contactId) return

    const member = await findMember(session.user.contactId)
    // A member no longer on file is left as they are: `requireMember` signs
    // them out on their next request, which a hook on this endpoint cannot.
    if (member) session.user = sessionUser(member)
  })
})
