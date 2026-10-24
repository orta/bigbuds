/**
 * The session cookie's contents.
 *
 * Display fields and the contact IRI only — never tokens, never the password.
 * The member's live Gladstone client lives server-side in the client cache,
 * keyed off `contactId`.
 */
declare module '#auth-utils' {
  interface User {
    /** IRI, e.g. `/gs/contacts/8035356`. The identity everything hangs off. */
    contactId: string
    email: string
    name: string
    givenName: string
    membershipNumber: string
    visible: boolean
    shareEntries: boolean
    /** Contact IRIs of the members allowed to book this member onto classes. */
    bookableBy: string[]
    /** Category keys hidden from this member's own timetable. */
    hiddenCategories: string[]
    /** Whether classes that have already started are dropped from the timetable. */
    hideFinished: boolean
    /** Whether virtual (unstaffed) classes are dropped from the timetable. */
    hideVirtual: boolean
  }
}

export {}
