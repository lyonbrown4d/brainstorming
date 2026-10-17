import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { MetadataDatabase } from '@main/storage/initialize'
import { preferences, recentFiles, workspaceRecovery } from '@main/storage/schema'
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

export const createPreferencesRepository = (database: MetadataDatabase): PreferencesRepository => ({
  getLanguage: () =>
    Promise.resolve().then(() => {
      const row = database.select().from(preferences).where(eq(preferences.id, 1)).get()
      if (!row) return null
      if (!isAppLanguage(row.language)) throw new TypeError('Unsupported application language')
      return row.language
    }),
  setLanguage: (language) =>
    Promise.resolve().then(() => {
      if (!isAppLanguage(language)) throw new TypeError('Unsupported application language')
      database
        .insert(preferences)
        .values({ id: 1, language })
        .onConflictDoUpdate({ target: preferences.id, set: { language } })
        .run()
    }),
})

export const createRecentFilesRepository = (database: MetadataDatabase): RecentFilesRepository => ({
  read: () =>
    Promise.resolve().then(() =>
      recentPathsSchema.parse(
        database
          .select({ path: recentFiles.path })
          .from(recentFiles)
          .orderBy(asc(recentFiles.position))
          .all()
          .map((row) => row.path),
      ),
    ),
  replace: (paths) => {
    const snapshot = [...paths]
    return Promise.resolve().then(() => {
      const validated = recentPathsSchema.parse(snapshot)
      database.transaction((transaction) => {
        transaction.delete(recentFiles).run()
        if (validated.length > 0)
          transaction
            .insert(recentFiles)
            .values(validated.map((path, position) => ({ position, path })))
            .run()
      })
    })
  },
})

export const createRecoveryIndexRepository = (
  database: MetadataDatabase,
): RecoveryIndexRepository => ({
  read: () =>
    Promise.resolve().then(() =>
      validateRecoveryIndex(
        database
          .select({
            documentId: workspaceRecovery.documentId,
            fileName: workspaceRecovery.fileName,
            protocolVersion: workspaceRecovery.protocolVersion,
          })
          .from(workspaceRecovery)
          .orderBy(asc(workspaceRecovery.position))
          .all(),
      ),
    ),
  replace: (entries) => {
    const snapshot = entries.map((entry) => ({ ...entry }))
    return Promise.resolve().then(() => {
      const validated = validateRecoveryIndex(snapshot)
      database.transaction((transaction) => {
        transaction.delete(workspaceRecovery).run()
        if (validated.length > 0)
          transaction
            .insert(workspaceRecovery)
            .values(validated.map((entry, position) => ({ ...entry, position })))
            .run()
      })
    })
  },
})
