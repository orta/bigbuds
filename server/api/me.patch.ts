/** Updates the member's own sharing settings. */

import { z } from 'zod'
import { CATEGORY_ORDER } from '#shared/categories'
import { updateSettings } from '../utils/members'
import { requireMember, sessionUser } from '../utils/session'

const Body = z.object({
  visible: z.boolean().optional(),
  shareEntries: z.boolean().optional(),
  // Validated against the known keys so an unknown one cannot be stored and
  // then silently hide nothing forever.
  hiddenCategories: z.array(z.enum(CATEGORY_ORDER as [string, ...string[]])).optional(),
  hideFinished: z.boolean().optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const settings = await readValidatedBody(event, Body.parse)

  const updated = await updateSettings(member.contactId, settings)

  await setUserSession(event, { user: sessionUser(updated) })
  return { user: sessionUser(updated) }
})
