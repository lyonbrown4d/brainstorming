import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { initializeMetadataDatabase } from '@main/storage/initialize'
import {
  createPreferencesRepository,
  createRecentFilesRepository,
  createRecoveryIndexRepository,
  type PreferencesRepository,
  type RecentFilesRepository,
} from '@main/storage/repositories'
import { metadataSchema } from '@main/storage/schema'
import type { RecoveryIndexRepository } from '@main/workspace-recovery/repository'

/** One main-process connection; neither SQL nor its path is exposed through IPC. */
export class LocalDatabase {
  readonly preferences: PreferencesRepository
  readonly recentFiles: RecentFilesRepository
  readonly recoveryIndex: RecoveryIndexRepository
  private readonly connection: Database.Database

  constructor(storageDirectory: string) {
    mkdirSync(storageDirectory, { recursive: true, mode: 0o700 })
    this.connection = new Database(path.join(storageDirectory, 'brainstorming.sqlite'), {
      timeout: 3000,
    })
    try {
      this.connection.pragma('foreign_keys = ON')
      const database = drizzle(this.connection, { schema: metadataSchema })
      initializeMetadataDatabase(database)
      this.connection.pragma('journal_mode = WAL')
      this.preferences = createPreferencesRepository(database)
      this.recentFiles = createRecentFilesRepository(database)
      this.recoveryIndex = createRecoveryIndexRepository(database)
    } catch (error) {
      this.connection.close()
      throw error
    }
  }

  close = (): void => {
    if (this.connection.open) this.connection.close()
  }
}
