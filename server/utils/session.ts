/**
 * Session helpers.
 *
 * The session cookie holds display fields and the contact IRI. The member's
 * real BigBox session lives server-side in the client cache, keyed off the
 * record this looks up.
 */

import type { H3Event } from 'h3'
import { findMember, mayBookFor, memberName } from './members'
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

/**
 * The member a booking action is *for*.
 *
 * Normally the signed-in member. When `forContactId` names somebody else, they
 * must have granted this viewer the right to book for them — which is checked
 * here, against the store, on every request, rather than being inferred from
 * the browser having offered the option.
 *
 * The two failure modes answer the same way on purpose: "no such member" and
 * "that member has not allowed you" are one message, so this cannot be used to
 * find out who has signed up.
 */
export async function requireSubject(
  viewer: Member,
  forContactId?: string,
): Promise<Member> {
  if (!forContactId || forContactId === viewer.contactId) return viewer

  const subject = await findMember(forContactId)

  if (!subject || !mayBookFor(subject, viewer.contactId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'They have not asked you to book for them.',
    })
  }

  return subject
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
    bookableBy: member.bookableBy,
    hiddenCategories: member.hiddenCategories,
    hideFinished: member.hideFinished,
  }
}
