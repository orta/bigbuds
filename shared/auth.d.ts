/**
 * The session cookie's contents.
 *
 * Display fields and the contact IRI only — never tokens, never the password.
 * The member's real BigBox session lives server-side in the client cache,
 * keyed off `contactId`.
 */
declare module '#auth-utils' {
  interface User {
    /** IRI, e.g. `/bigbox/contacts/2327536`. The identity everything hangs off. */
    contactId: string
    email: string
    name: string
    givenName: string
    membershipNumber: string
    visible: boolean
    shareEntries: boolean
    /** Category keys hidden from this member's own timetable. */
    hiddenCategories: string[]
    /** Whether classes that have already started are dropped from the timetable. */
    hideFinished: boolean
  }
}

export {}
