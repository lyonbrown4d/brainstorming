import { z } from 'zod'
import type { MetadataDatabase } from '@main/storage/schema'
import {
  validateRecoveryIndex,
  type RecoveryIndexRepository,
} from '@main/workspace-recovery/repository'
import { isAppLanguage, type AppLanguage } from '@shared/language'

export interface PreferencesRepository {
  getLanguage(): Promise<AppLanguage | null>
  setLanguage(language: AppLanguage): Promise<void>
}

export interface RecentFilesRepository {
  read(): Promise<readonly string[]>
  replace(paths: readonly string[]): Promise<void>
}

const recentPathsSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(32768)
      .refine((path) => !path.includes('\0')),
  )
  .max(10)
  .refine((paths) => new Set(paths).size === paths.length)

export const createPreferencesRepository = (
  database: MetadataDatabase,
  ready: Promise<void>,
): PreferencesRepository => ({
  getLanguage: async () => {
    await ready
    const row = await database
      .selectFrom('preferences')
      .select('language')
      .where('id', '=', 1)
      .executeTakeFirst()
    if (!row) return null
    if (!isAppLanguage(row.language)) throw new TypeError('Unsupported application language')
    return row.language
  },
  setLanguage: async (language) => {
    await ready
    if (!isAppLanguage(language)) throw new TypeError('Unsupported application language')
    await database
      .insertInto('preferences')
      .values({ id: 1, language })
      .onConflict((conflict) => conflict.column('id').doUpdateSet({ language }))
      .execute()
  },
})

export const createRecentFilesRepository = (
  database: MetadataDatabase,
  ready: Promise<void>,
): RecentFilesRepository => ({
  read: async () => {
    await ready
    const rows = await database
      .selectFrom('recent_files')
      .select('path')
      .orderBy('position')
      .execute()
    return recentPathsSchema.parse(rows.map((row) => row.path))
  },
  replace: (paths) => {
    const snapshot = [...paths]
    return ready.then(async () => {
      const validated = recentPathsSchema.parse(snapshot)
      await database.transaction().execute(async (transaction) => {
        await transaction.deleteFrom('recent_files').execute()
        if (validated.length > 0)
          await transaction
            .insertInto('recent_files')
            .values(validated.map((path, position) => ({ position, path })))
            .execute()
      })
    })
  },
})

export const createRecoveryIndexRepository = (
  database: MetadataDatabase,
  ready: Promise<void>,
): RecoveryIndexRepository => ({
  read: async () => {
    await ready
    const rows = await database
      .selectFrom('workspace_recovery')
      .select([
        'document_id as documentId',
        'file_name as fileName',
        'protocol_version as protocolVersion',
      ])
      .orderBy('position')
      .execute()
    return validateRecoveryIndex(rows)
  },
  replace: (entries) => {
    const snapshot = entries.map((entry) => ({ ...entry }))
    return ready.then(async () => {
      const validated = validateRecoveryIndex(snapshot)
      await database.transaction().execute(async (transaction) => {
        await transaction.deleteFrom('workspace_recovery').execute()
        if (validated.length > 0)
          await transaction
            .insertInto('workspace_recovery')
            .values(
              validated.map((entry, position) => ({
                position,
                document_id: entry.documentId,
                file_name: entry.fileName,
                protocol_version: entry.protocolVersion,
              })),
            )
            .execute()
      })
    })
  },
})
