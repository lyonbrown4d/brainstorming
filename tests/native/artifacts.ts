import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'

/** Native screenshots and diagnostics share a portable, ignored output directory. */
export const nativeArtifact = async (name: string): Promise<string> => {
  const directory = resolve(process.env.BRAINSTORMING_E2E_ARTIFACTS ?? 'test-results/native')
  await mkdir(directory, { recursive: true })
  return join(directory, name)
}
