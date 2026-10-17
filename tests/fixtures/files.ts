import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DocumentFiles } from '@main/files'
import { LocalDatabase } from '@main/storage/database'
import { FileSecuritySession } from '@main/file-security/session'
import { DocumentBackups } from '@main/file-security/backups'
import { RecoveryWorkspaceService } from '@main/workspace-recovery/service'

const fixtures = new Map<
  DocumentFiles,
  { database: LocalDatabase; security: FileSecuritySession }
>()

/** Native file tests use the real metadata database alongside the same AES ZIP services. */
export const documentFiles = (directory: string): DocumentFiles => {
  const database = new LocalDatabase(directory)
  const security = new FileSecuritySession()
  const files = new DocumentFiles(
    directory,
    security,
    new DocumentBackups(join(directory, 'history-v1')),
    new RecoveryWorkspaceService(directory, security, database.recoveryIndex),
    database.recentFiles,
  )
  fixtures.set(files, { database, security })
  return files
}

export const recoveryIndexFor = (files: DocumentFiles) => {
  const fixture = fixtures.get(files)
  if (!fixture) throw new Error('Missing native file fixture')
  return fixture.database.recoveryIndex
}

export const recoveryArchive = async (
  directory: string,
  files: DocumentFiles,
  index = 0,
): Promise<Buffer> => {
  const entry = (await recoveryIndexFor(files).read())[index]
  if (!entry) throw new Error('Missing recovery archive')
  return readFile(join(directory, 'recovery-sqlite-v1', entry.fileName))
}

export const closeDocumentFiles = async (): Promise<void> => {
  for (const [files, { database, security }] of fixtures) {
    await files.flush()
    security.dispose()
    database.close()
  }
  fixtures.clear()
}
