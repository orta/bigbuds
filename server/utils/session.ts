/**
 * Session helpers.
 *
 * The session cookie holds only an id and some display fields — never tokens
 * or credentials. The member's real BigBox session lives server-side in the
 * client cache, keyed off the row this looks up.
 */

import type { H3Event } from 'h3'
import type { User } from '../database/schema'
import { findUser } from './members'

/**
 * The signed-in member's row, or a 401.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the cookie, so revoking someone — or their own visibility change —
 * takes effect immediately rather than whenever their cookie happens to expire.
 */
export async function requireMember(event: H3Event): Promise<User> {
  const { user } = await requireUserSession(event)
  const member = await findUser(user.id)

  if (!member) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Your account is no longer available.' })
  }

  return member
}

/** The subset of a member that is safe to put in a cookie and send to the browser. */
export function sessionUser(user: User) {
  return {
    id: user.id,
    contactId: user.contactId,
    email: user.email,
    name: `${user.givenName} ${user.familyName}`.trim(),
    givenName: user.givenName,
    membershipNumber: user.membershipNumber,
    visible: user.visible,
  }
}
