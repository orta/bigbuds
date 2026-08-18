/**
 * Signs a member in with their BigBox credentials.
 *
 * There is no separate registration: a BigBox membership is the account. A
 * first login creates the row, later ones refresh the stored password.
 */

import { z } from 'zod'
import { signIn, syncBookings } from '../../utils/members'
import { ApiError } from '../../utils/resamania'
import { sessionUser } from '../../utils/session'

const Body = z.object({
  email: z.string().trim().min(1, 'Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
})

export default defineEventHandler(async event => {
  const { email, password } = await readValidatedBody(event, Body.parse)

  try {
    const user = await signIn(email, password)
    await setUserSession(event, { user: sessionUser(user) })

    // Snapshot their bookings now so they show up to everyone else straight
    // away rather than at the next scheduled sync. Failing here should not
    // fail the login — they are signed in either way.
    await syncBookings(user).catch(error => {
      console.error('Initial booking sync failed', error)
    })

    return { user: sessionUser(user) }
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'invalid_credentials') {
      throw createError({
        statusCode: 401,
        statusMessage: 'That email and password were not accepted by BigBox.',
      })
    }
    throw error
  }
})
