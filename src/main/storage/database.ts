import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { assertMetadataSchema, initializeMetadataDatabase } from '@main/storage/initialize'
import {
  createPreferencesRepository,
  createRecentFilesRepository,
  createRecoveryIndexRepository,
  type PreferencesRepository,
  type RecentFilesRepository,
} from '@main/storage/repositories'
import type { MetadataSchema } from '@main/storage/schema'
import type { RecoveryIndexRepository } from '@main/workspace-recovery/repository'

/** One main-process connection; neither SQL nor its path is exposed through IPC. */
export class LocalDatabase {
  readonly preferences: PreferencesRepository
  readonly recentFiles: RecentFilesRepository
  readonly recoveryIndex: RecoveryIndexRepository
  private readonly connection: Database.Database

  constructor(storageDirectory: string) {
    mkdirSync(storageDirectory, { recursive: true, mode: 0o700 })
    this.connection = new Database(path.join(storageDirectory, 'brainstorming-local.sqlite'), {
      timeout: 3000,
    })
    try {
      this.connection.pragma('foreign_keys = ON')
      assertMetadataSchema(this.connection)
      const database = new Kysely<MetadataSchema>({
        dialect: new SqliteDialect({ database: this.connection }),
      })
      const ready = initializeMetadataDatabase(database)
      // A synchronous close may interrupt initialization; callers still receive the failure.
      void ready.catch(() => {
        if (this.connection.open) this.connection.close()
      })
      this.connection.pragma('journal_mode = WAL')
      this.preferences = createPreferencesRepository(database, ready)
      this.recentFiles = createRecentFilesRepository(database, ready)
      this.recoveryIndex = createRecoveryIndexRepository(database, ready)
    } catch (error) {
      this.connection.close()
      throw error
    }
  }

  close = (): void => {
    if (this.connection.open) this.connection.close()
  }
}
