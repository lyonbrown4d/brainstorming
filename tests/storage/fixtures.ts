import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach } from 'vitest'
import { LocalDatabase } from '@main/storage/database'
import { recoveryFileStem, type RecoveryEntry } from '@main/workspace-recovery/repository'

const directories: string[] = []
const databases: LocalDatabase[] = []

export const storageDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'brainstorming-storage-'))
  directories.push(directory)
  return directory
}

export const openDatabase = (directory: string): LocalDatabase => {
  const database = new LocalDatabase(directory)
  databases.push(database)
  return database
}

export const recoveryEntry = (documentId: string): RecoveryEntry => ({
  documentId,
  fileName: `${recoveryFileStem(documentId)}.${randomUUID()}.brainstorming`,
  protocolVersion: 2,
})

afterEach(async () => {
  databases.splice(0).forEach((database) => {
    database.close()
  })
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})
