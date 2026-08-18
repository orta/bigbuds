import { forgetClient } from '../../utils/members'

export default defineEventHandler(async event => {
  const session = await getUserSession(event)
  if (session.user?.contactId) forgetClient(session.user.contactId)

  await clearUserSession(event)
  return { ok: true }
})
