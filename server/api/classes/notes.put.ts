/**
 * Writes the viewer's own note about a class type.
 *
 * A PUT rather than a POST because there is exactly one note per member per
 * class type: sending it twice leaves the same single note, and sending an
 * empty one removes it. There is no endpoint for anybody else's.
 */

import { z } from 'zod'
import { NOTE_MAX_LENGTH, isActivityId, notesFor, saveNote } from '../../utils/notes'
import { requireMember } from '../../utils/session'

const Body = z.object({
  activityId: z.string().refine(isActivityId, 'Not an activity'),
  /**
   * Accepted a little longer than it will be stored, and truncated rather than
   * refused. Losing a paragraph to a validation error is a worse outcome than
   * having it shortened, and the composer already counts down to the limit.
   */
  text: z.string().max(NOTE_MAX_LENGTH * 4),
})

export default defineEventHandler(async event => {
  const member = await requireMember(event)
  const { activityId, text } = await readValidatedBody(event, Body.parse)

  await saveNote(member.contactId, activityId, text)

  // The whole set back, so the modal shows what was actually stored — the
  // trimmed, truncated version — rather than what the box happened to hold.
  return notesFor(activityId, member.contactId)
})
