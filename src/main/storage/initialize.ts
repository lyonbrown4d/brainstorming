import type Database from 'better-sqlite3'
import { Migrator } from 'kysely/migration'
import * as initialMetadata from '@main/storage/migrations/001-metadata'
import type { MetadataDatabase } from '@main/storage/schema'

export const metadataMigrations = { '001-metadata': initialMetadata }
const expectedTables = new Set([
  'kysely_migration',
  'kysely_migration_lock',
  'preferences',
  'recent_files',
  'workspace_recovery',
])

/** Refuse foreign/legacy databases before the migrator can create bookkeeping tables. */
export const assertMetadataSchema = (connection: Database.Database): void => {
  const version: unknown = connection.pragma('user_version', { simple: true })
  if (version !== 0) throw new Error('Unsupported local database schema')
  const objects = connection
    .prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
    .all() as { name: string; type: string }[]
  if (objects.length === 0) return
  if (
    objects.some((object) => object.type !== 'table' || !expectedTables.has(object.name)) ||
    objects.length !== expectedTables.size
  )
    throw new Error('Unrecognized local database schema')
  const migrations = connection
    .prepare('SELECT name FROM kysely_migration ORDER BY name')
    .all() as { name: string }[]
  if (
    migrations.length !== Object.keys(metadataMigrations).length ||
    migrations.some((migration) => !Object.hasOwn(metadataMigrations, migration.name))
  )
    throw new Error('Unsupported local database schema')
}

export const initializeMetadataDatabase = async (database: MetadataDatabase): Promise<void> => {
  const migrator = new Migrator({
    db: database,
    provider: { getMigrations: () => Promise.resolve(metadataMigrations) },
  })
  const result = await migrator.migrateToLatest()
  if (result.error)
    throw new Error('Failed to migrate local database schema', { cause: result.error })
}
