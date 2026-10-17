import { stat, unlink } from 'node:fs/promises'
import type { Stats as FileStats } from 'node:fs'
import type { NativeConnection } from '@main/document-db/connection'

export const fileIdentity = async (path: string): Promise<FileStats | undefined> => {
  try {
    return await stat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/** Delete only an inode created by this failed attempt, while excluding all other SQLite writers. */
export const removeFailedCreation = async (
  db: NativeConnection,
  path: string,
  identity: FileStats,
): Promise<void> => {
  await db.exec('BEGIN IMMEDIATE')
  try {
    const row = (await db.prepare('SELECT count(*) AS count FROM document').get()) as {
      count: number
    }
    const current = await fileIdentity(path)
    if (row.count === 0 && current?.ino === identity.ino && current.dev === identity.dev)
      await unlink(path)
  } finally {
    await db.exec('ROLLBACK')
  }
}
