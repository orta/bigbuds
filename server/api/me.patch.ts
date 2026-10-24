/** Updates the member's own sharing settings. */

import { z } from 'zod'
import { CATEGORY_ORDER } from '#shared/categories'
import { updateSettings } from '../utils/members'
import { readMembers } from '../utils/store'
import { requireMember, sessionUser } from '../utils/session'

const Body = z.object({
  visible: z.boolean().optional(),
  shareEntries: z.boolean().optional(),
  /** Contact IRIs of members allowed to book this member onto classes. */
  bookableBy: z.array(z.string()).optional(),
  // Validated against the known keys so an unknown one cannot be stored and
  // then silently hide nothing forever.
  hiddenCategories: z.array(z.enum(CATEGORY_ORDER as [string, ...string[]])).optional(),
  hideFinished: z.boolean().optional(),
  hideVirtual: z.boolean().optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const settings = await readValidatedBody(event, Body.parse)

  if (settings.bookableBy) {
    /**
     * Only real members, each at most once, and never the member themselves.
     *
     * Booking rights are the one setting here that another person can act on,
     * so what is stored has to be a list of people rather than whatever the
     * browser sent — a stale id would sit in the file looking like a granted
     * permission, and a self-grant would make `mayBookFor` ambiguous.
     */
    const known = new Set((await readMembers()).map(other => other.contactId))
    settings.bookableBy = [...new Set(settings.bookableBy)]
      .filter(contactId => contactId !== member.contactId && known.has(contactId))
  }

  const updated = await updateSettings(member.contactId, settings)

  await setUserSession(event, { user: sessionUser(updated) })
  return { user: sessionUser(updated) }
})
