import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { decodeBrainstorming } from '@tests/electron/codec'
import { recoveryFileStem, validateRecoveryIndex } from '@main/workspace-recovery/repository'
import { storageOperation } from '@tests/electron/storage'

/** Read the real SQLite recovery index and its native SQLite documents. */
export const recoveryPaths = async (directory: string): Promise<string[]> => {
  const entries = validateRecoveryIndex(await storageOperation('recovery:read', directory))
  return entries.map(({ fileName }) => join(directory, 'recovery-sqlite-v1', fileName))
}
export const seedRecovery = async (
  directory: string,
  documentId: string,
  bytes: Uint8Array | string,
): Promise<string> => {
  const folder = join(directory, 'recovery-sqlite-v1')
  await mkdir(folder, { recursive: true })
  const fileName = `${recoveryFileStem(documentId)}.${randomUUID()}.brainstorming`
  const path = join(folder, fileName)
  await writeFile(path, bytes)
  await storageOperation(
    'recovery:replace',
    directory,
    JSON.stringify([{ documentId, fileName, protocolVersion: 2 }]),
  )
  return path
}
export const nativeRecoveryBytes = async (directory: string): Promise<Buffer | null> => {
  const [path] = await recoveryPaths(directory)
  return path ? readFile(path).catch(() => null) : null
}
export const nativeRecoveryContents = async (directory: string): Promise<string> => {
  const paths = await recoveryPaths(directory)
  const snapshots = await Promise.all(paths.map((path) => readFile(path).catch(() => null)))
  const workbooks = []
  // Decode sequentially to keep native SQLite fixture connections bounded.
  for (const bytes of snapshots) if (bytes) workbooks.push(await decodeBrainstorming(bytes))
  return JSON.stringify(workbooks)
}
