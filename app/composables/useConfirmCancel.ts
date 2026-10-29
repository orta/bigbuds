import { LazyConfirmCancel } from '#components'
import type { BookingBuddy, ClassRow } from '#shared/types'
import { whenLabel } from '#shared/format'
import { addDays, today as clubToday } from '#shared/naive'

/**
 * Asks before a booking or a waiting-list place is given up.
 *
 * Returns a function that resolves `true` only when the member pressed the
 * confirming button; closing the dialog any other way is a no. One modal is
 * created per page that asks, which is what `useOverlay` expects.
 */
export function useConfirmCancel() {
  const overlay = useOverlay()
  const modal = overlay.create(LazyConfirmCancel)

  const today = clubToday()
  const tomorrow = addDays(today, 1)

  return async (entry: ClassRow, subject?: BookingBuddy): Promise<boolean> => {
    const held = subject
      ? entry.bookedFor.find(booked => booked.contactId === subject.contactId)
      : null

    const instance = modal.open({
      name: entry.name,
      when: entry.start ? whenLabel(entry.start, today, tomorrow) : '',
      queued: subject ? held?.state === 'queued' : entry.queued,
      forName: subject?.name,
    })

    return (await instance.result) === true
  }
}
