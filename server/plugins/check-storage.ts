/**
 * Fails loudly at boot if the store is not writable.
 *
 * Without this the first symptom of a misconfigured volume is a 500 on
 * sign-in, which reads as a broken application rather than a mount that the
 * process cannot write to. The common cause is a volume owned by root with a
 * non-root container, and the second is `BIGBUDS_DATA_DIR` being unset in
 * production — where the store silently lands on the container's ephemeral
 * disk and every member is signed out on the next deploy.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineNitroPlugin(async () => {
  const configured = process.env.BIGBUDS_DATA_DIR
  const dir = configured || join(process.cwd(), '.data')

  if (!configured && process.env.NODE_ENV === 'production') {
    console.warn(
      `[storage] BIGBUDS_DATA_DIR is not set, so member data is being written to ${dir}. `
      + 'On a container that is ephemeral: everyone will be signed out on the next deploy. '
      + "Mount a volume and point BIGBUDS_DATA_DIR at it.",
    )
  }

  const probe = join(dir, '.write-test')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(probe, '')
    await rm(probe)
    console.log(`[storage] Member data directory ready at ${dir}`)
  } catch (error) {
    console.error(
      `[storage] Cannot write to ${dir}. Member data cannot be saved, so signing in will fail. `
      + 'If this is a mounted volume, check that its owner matches the user this process runs as.',
      error,
    )
  }
})
