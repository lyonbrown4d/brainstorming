import { sql, type Kysely } from 'kysely'
import type { Migration, MigrationProvider } from 'kysely/migration'

export const APPLICATION_ID = 0x42524e53
export const PROTOCOL_VERSION = 1
export const FEATURES = ['ordered-topics', 'chunked-resources'] as const
export const MIGRATION_ID = '202610170001_native_document'

const statements = [
  `CREATE TABLE document (id TEXT PRIMARY KEY, title TEXT NOT NULL, protocol INTEGER NOT NULL, required_features TEXT NOT NULL)`,
  `CREATE TABLE sheets (id TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, document_id TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL, root_id TEXT NOT NULL, metadata TEXT NOT NULL)`,
  `CREATE TABLE topics (sheet_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sheet_id,id))`,
  `CREATE INDEX topics_parent ON topics(sheet_id,parent_id,position)`,
  `CREATE TABLE relations (sheet_id TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sheet_id,id))`,
  `CREATE TABLE topic_groups (sheet_id TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sheet_id,id))`,
  `CREATE TABLE group_members (sheet_id TEXT NOT NULL, group_id TEXT NOT NULL, topic_id TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(sheet_id,group_id,topic_id))`,
  `CREATE TABLE callouts (sheet_id TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sheet_id,id))`,
  `CREATE TABLE presentation_steps (sheet_id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(sheet_id,position))`,
  `CREATE TABLE resources (sheet_id TEXT NOT NULL, id TEXT NOT NULL, object_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(sheet_id,id))`,
  `CREATE TABLE resource_objects (id TEXT PRIMARY KEY, byte_length INTEGER NOT NULL CHECK(byte_length >= 0))`,
  `CREATE TABLE resource_chunks (object_id TEXT NOT NULL, position INTEGER NOT NULL, data BLOB NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(object_id,position))`,
  `CREATE TABLE topic_resources (sheet_id TEXT NOT NULL, topic_id TEXT NOT NULL, resource_id TEXT NOT NULL, role TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(sheet_id,topic_id,role,position))`,
  `CREATE TABLE resource_variants (object_id TEXT NOT NULL, kind TEXT NOT NULL, variant_object_id TEXT NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, PRIMARY KEY(object_id,kind))`,
  `CREATE TABLE image_tiles (object_id TEXT NOT NULL, level INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, tile_object_id TEXT NOT NULL, PRIMARY KEY(object_id,level,x,y))`,
  `CREATE TABLE document_revisions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, metadata TEXT NOT NULL)`,
  `CREATE TABLE revision_resources (revision_id TEXT NOT NULL, object_id TEXT NOT NULL, PRIMARY KEY(revision_id,object_id))`,
] as const

const initial: Migration = {
  up: async (db: Kysely<unknown>): Promise<void> => {
    for (const statement of statements) await sql.raw(statement).execute(db)
    await sql.raw(`PRAGMA application_id = ${APPLICATION_ID}`).execute(db)
  },
}

/** Static imports work in packaged Electron; no migration directory discovery. */
export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve({ [MIGRATION_ID]: initial }),
}
