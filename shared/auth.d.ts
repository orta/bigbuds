/**
 * The session cookie's contents.
 *
 * Display fields and an id only — never tokens, never the password. The real
 * BigBox session lives server-side, keyed off `id`.
 */
declare module '#auth-utils' {
  interface User {
    id: number
    contactId: string
    email: string
    name: string
    givenName: string
    membershipNumber: string
    visible: boolean
  }
}

export {}
