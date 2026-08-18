/** Updates the member's own settings. Only visibility is settable so far. */

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '../database/schema'
import { useDb } from '../utils/db'
import { requireMember, sessionUser } from '../utils/session'

const Body = z.object({
  visible: z.boolean(),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { visible } = await readValidatedBody(event, Body.parse)

  const [updated] = await useDb()
    .update(users)
    .set({ visible, updatedAt: new Date() })
    .where(eq(users.id, member.id))
    .returning()

  if (!updated) throw createError({ statusCode: 404 })

  await setUserSession(event, { user: sessionUser(updated) })
  return { user: sessionUser(updated) }
})
