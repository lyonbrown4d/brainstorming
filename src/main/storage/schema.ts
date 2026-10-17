import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { AppLanguage } from '@shared/language'

/** Only application metadata belongs here; workbook payloads remain in ZIP files. */
export const preferences = sqliteTable(
  'preferences',
  {
    id: integer('id').primaryKey(),
    language: text('language').$type<AppLanguage>().notNull(),
  },
  (table) => [
    check('preferences_singleton', sql`${table.id} = 1`),
    check('preferences_language', sql`${table.language} IN ('zh-CN', 'en')`),
  ],
)

export const recentFiles = sqliteTable(
  'recent_files',
  {
    position: integer('position').primaryKey(),
    path: text('path').notNull().unique(),
  },
  (table) => [
    check('recent_files_position', sql`${table.position} BETWEEN 0 AND 9`),
    check('recent_files_path', sql`length(${table.path}) > 0`),
  ],
)

export const workspaceRecovery = sqliteTable(
  'workspace_recovery',
  {
    position: integer('position').primaryKey(),
    documentId: text('document_id').notNull().unique(),
    fileName: text('file_name').notNull().unique(),
    protocolVersion: integer('protocol_version').$type<2>().notNull(),
  },
  (table) => [
    check('workspace_recovery_position', sql`${table.position} BETWEEN 0 AND 31`),
    check('workspace_recovery_document_id', sql`length(${table.documentId}) BETWEEN 1 AND 4096`),
    check('workspace_recovery_protocol', sql`${table.protocolVersion} = 2`),
  ],
)

export const metadataSchema = { preferences, recentFiles, workspaceRecovery }
