/**
 * Everyone's notes about one class type.
 *
 * Fetched when a class is opened rather than sent with the timetable: a day
 * holds sixty-odd classes and a member opens one or two. The timetable carries
 * only `noteCount`, which is what makes the rest worth opening.
 */

import { z } from 'zod'
import { isActivityId, notesFor } from '../../utils/notes'
import { requireMember } from '../../utils/session'

const Query = z.object({
  /** An activity IRI, e.g. `/gs/activities/strength-development`. */
  activityId: z.string().refine(isActivityId, 'Not an activity'),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { activityId } = await getValidatedQuery(event, Query.parse)

  return notesFor(activityId, member.contactId)
})
