/**
 * Session helpers.
 *
 * The session cookie holds display fields and the contact IRI. The member's
 * real BigBox session lives server-side in the client cache, keyed off the
 * record this looks up.
 */

import type { H3Event } from 'h3'
import { findMember, memberName } from './members'
import type { Member } from './store'

/**
 * The signed-in member's record, or a 401.
 *
 * Re-read from the store on every request rather than trusted from the cookie,
 * so a settings change takes effect immediately rather than whenever the
 * cookie happens to expire.
 */
export async function requireMember(event: H3Event): Promise<Member> {
  const { user } = await requireUserSession(event)
  const member = await findMember(user.contactId)

  if (!member) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Your account is no longer available.' })
  }

  return member
}

/** The subset of a member that is safe to put in a cookie and send to the browser. */
export function sessionUser(member: Member) {
  return {
    contactId: member.contactId,
    email: member.email,
    name: memberName(member),
    givenName: member.givenName,
    membershipNumber: member.membershipNumber,
    visible: member.visible,
    shareEntries: member.shareEntries,
  }
}
