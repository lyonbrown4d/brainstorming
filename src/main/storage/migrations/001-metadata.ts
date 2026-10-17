import { sql, type Kysely } from 'kysely'

export const up = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema
    .createTable('preferences')
    .addColumn('id', 'integer', (column) => column.primaryKey())
    .addColumn('language', 'text', (column) => column.notNull())
    .addCheckConstraint('preferences_singleton', sql`id = 1`)
    .addCheckConstraint('preferences_language', sql`language IN ('zh-CN', 'en')`)
    .execute()
  await database.schema
    .createTable('recent_files')
    .addColumn('position', 'integer', (column) => column.primaryKey())
    .addColumn('path', 'text', (column) => column.notNull().unique())
    .addCheckConstraint('recent_files_position', sql`position BETWEEN 0 AND 9`)
    .addCheckConstraint('recent_files_path', sql`length(path) > 0`)
    .execute()
  await database.schema
    .createTable('workspace_recovery')
    .addColumn('position', 'integer', (column) => column.primaryKey())
    .addColumn('document_id', 'text', (column) => column.notNull().unique())
    .addColumn('file_name', 'text', (column) => column.notNull().unique())
    .addColumn('protocol_version', 'integer', (column) => column.notNull())
    .addCheckConstraint('workspace_recovery_position', sql`position BETWEEN 0 AND 31`)
    .addCheckConstraint(
      'workspace_recovery_document_id',
      sql`length(document_id) BETWEEN 1 AND 4096`,
    )
    .addCheckConstraint('workspace_recovery_protocol', sql`protocol_version = 2`)
    .execute()
}

export const down = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema.dropTable('workspace_recovery').execute()
  await database.schema.dropTable('recent_files').execute()
  await database.schema.dropTable('preferences').execute()
}
