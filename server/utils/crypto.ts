/**
 * Encryption for stored KAL passwords.
 *
 * The app signs in as each member on a schedule so their bookings stay fresh
 * for everyone else, and Gladstone offers nothing better to persist — it has
 * no token at all, and wants the member's email and password on every single
 * request. That means holding the real password,
 * which is a genuine liability and is treated as one:
 *
 * - AES-256-GCM, so a tampered ciphertext fails to decrypt rather than
 *   decrypting to something attacker-chosen.
 * - A fresh random IV per encryption, stored alongside. Reusing an IV with the
 *   same key is the one mistake that actually breaks GCM.
 * - The key lives only in `BIGBUDS_ENCRYPTION_KEY`, never in the database, so
 *   a leaked database dump on its own is not enough.
 *
 * Generate a key with `openssl rand -base64 32`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey

  const configured = process.env.BIGBUDS_ENCRYPTION_KEY
  if (!configured) {
    throw new Error(
      'BIGBUDS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.',
    )
  }

  const bytes = Buffer.from(configured, 'base64')
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `BIGBUDS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${bytes.length}. `
      + 'Generate one with `openssl rand -base64 32`.',
    )
  }

  cachedKey = bytes
  return bytes
}

/** Encrypts to `iv.ciphertext.tag`, all base64. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [iv, ciphertext, cipher.getAuthTag()]
    .map(part => part.toString('base64'))
    .join('.')
}

/** Reverses `encrypt`. Throws if the key is wrong or the value was tampered with. */
export function decrypt(value: string): string {
  const [iv, ciphertext, tag] = value.split('.').map(part => Buffer.from(part, 'base64'))
  if (!iv || !ciphertext || !tag) throw new Error('Malformed encrypted value')

  const decipher = createDecipheriv(ALGORITHM, key(), iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
