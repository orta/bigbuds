/** Updates the member's own sharing settings. */

import { z } from 'zod'
import { updateSettings } from '../utils/members'
import { requireMember, sessionUser } from '../utils/session'

const Body = z.object({
  visible: z.boolean().optional(),
  shareEntries: z.boolean().optional(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const settings = await readValidatedBody(event, Body.parse)

  const updated = await updateSettings(member.contactId, settings)

  await setUserSession(event, { user: sessionUser(updated) })
  return { user: sessionUser(updated) }
})
