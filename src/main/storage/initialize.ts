import { sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { metadataSchema } from '@main/storage/schema'

export type MetadataDatabase = BetterSQLite3Database<typeof metadataSchema>

/** Initial schema creation only. Existing unknown schemas must never be rewritten. */
export const initializeMetadataDatabase = (database: MetadataDatabase): void => {
  database.transaction(
    (transaction) => {
      const version = transaction.get<{ user_version: number }>(sql`PRAGMA user_version`)
      if (version.user_version === 1) return
      if (version.user_version !== 0) throw new Error('Unsupported local database schema')
      const existing = transaction.get<{ name: string } | undefined>(sql`
        SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1
      `)
      if (existing) throw new Error('Unrecognized local database schema')
      transaction.run(sql`
        CREATE TABLE preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          language TEXT NOT NULL CHECK (language IN ('zh-CN', 'en'))
        )
      `)
      transaction.run(sql`
        CREATE TABLE recent_files (
          position INTEGER PRIMARY KEY CHECK (position BETWEEN 0 AND 9),
          path TEXT NOT NULL UNIQUE CHECK (length(path) > 0)
        )
      `)
      transaction.run(sql`
        CREATE TABLE workspace_recovery (
          position INTEGER PRIMARY KEY CHECK (position BETWEEN 0 AND 31),
          document_id TEXT NOT NULL UNIQUE CHECK (length(document_id) BETWEEN 1 AND 4096),
          file_name TEXT NOT NULL UNIQUE,
          protocol_version INTEGER NOT NULL CHECK (protocol_version = 2)
        )
      `)
      transaction.run(sql`PRAGMA user_version = 1`)
    },
    { behavior: 'immediate' },
  )
}
