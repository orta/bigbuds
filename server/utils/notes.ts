/**
 * What members have written about a class type.
 *
 * The club's API carries a description per class, which says what the session
 * is — and says it in the voice of the person selling it. What it cannot say
 * is the thing you only learn by going: that this one is harder than the name
 * suggests, that the 06:30 fills from the front row back, that you want grip
 * socks. Those are the notes.
 *
 * They are keyed by activity IRI, so a note is about Body Pump rather than
 * about one Tuesday's Body Pump. Keying them to the class event would mean
 * writing the same thing every week and watching all of it fall off the end of
 * the timetable as each class passed.
 */

import type { ClassNote, ClassNotes } from '#shared/types'
import { memberName } from './members'
import type { Member } from './store'
import { readMembers, writeMember } from './store'

/**
 * As much as fits in a note.
 *
 * Long enough for a paragraph of real advice, short enough that the modal
 * stays a modal. Enforced on the way in rather than at render, so what is
 * stored is what will be shown.
 */
export const NOTE_MAX_LENGTH = 500

/**
 * An activity IRI, e.g. `/gs/activities/strength-development`.
 *
 * Gladstone has no class-type id, so the last segment is a slug of the class
 * title (see `classActivityId`) — lower-case letters, digits and hyphens. That
 * still rules out dots and slashes, so a traversal cannot get through.
 *
 * Checked because it ends up as a key in a JSON object that is written to
 * disk: without this, anything the browser sent would become a permanent
 * entry in the member's file, and `__proto__` is a key too.
 */
const ACTIVITY_IRI = /^\/[a-z0-9_]+\/activities\/[a-z0-9-]+$/

export const isActivityId = (value: string): boolean => ACTIVITY_IRI.test(value)

/**
 * How many notes exist for each class type.
 *
 * Computed across every member in one pass, so the timetable can mark sixty
 * classes without a lookup each. Pure, and takes the members rather than
 * reading them, because the two callers already hold the list.
 */
export function noteCounts(members: Member[]): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const member of members) {
    for (const activityId of Object.keys(member.notes ?? {})) {
      counts[activityId] = (counts[activityId] ?? 0) + 1
    }
  }

  return counts
}

/**
 * Everyone's notes about one class type, from the viewer's point of view.
 *
 * `visible` is not consulted. That switch is about whether your *bookings*
 * appear on other people's timetables — something that happens to you as a
 * side effect of booking a class. Writing a note is a deliberate act with a
 * name attached, and the composer says so, so hiding one behind the other
 * setting would mean a member wrote something, was told it was posted, and it
 * silently was not.
 */
export async function notesFor(
  activityId: string,
  viewerContactId: string,
): Promise<ClassNotes> {
  const members = await readMembers()

  const others: ClassNote[] = members.flatMap(member => {
    if (member.contactId === viewerContactId) return []

    const note = member.notes?.[activityId]
    if (!note) return []

    return [{
      contactId: member.contactId,
      name: memberName(member),
      text: note.text,
      updatedAt: note.updatedAt,
    }]
  })

  // Newest first: a note somebody wrote last week is more likely to describe
  // the class as it is now than one from a year ago, and coaches change.
  others.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const yours = members.find(member => member.contactId === viewerContactId)
    ?.notes?.[activityId]?.text ?? null

  return { yours, others }
}

/**
 * Writes, replaces or removes the viewer's own note.
 *
 * An empty note is a deletion rather than an empty note, so clearing the box
 * and saving does the obvious thing — and the key leaves the record entirely,
 * which is what keeps `noteCounts` honest.
 */
export function saveNote(
  contactId: string,
  activityId: string,
  text: string,
): Promise<Member> {
  const trimmed = text.trim().slice(0, NOTE_MAX_LENGTH)

  return writeMember(contactId, current => {
    // Rebuilt without the key rather than spread-and-deleted: the key comes
    // from a request, and `delete` on a computed property is one of the few
    // ways to reach a prototype slot by accident.
    const notes = Object.fromEntries(
      Object.entries(current!.notes).filter(([key]) => key !== activityId),
    )

    if (trimmed) notes[activityId] = { text: trimmed, updatedAt: new Date().toISOString() }

    return { ...current!, notes, updatedAt: new Date().toISOString() }
  })
}
