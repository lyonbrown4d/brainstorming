import type { Kysely } from 'kysely'
import type { AppLanguage } from '@shared/language'

/** Only application metadata belongs here; workbook payloads remain in ZIP files. */
export interface MetadataSchema {
  preferences: { id: number; language: AppLanguage }
  recent_files: { position: number; path: string }
  workspace_recovery: {
    position: number
    document_id: string
    file_name: string
    protocol_version: 2
  }
}

export type MetadataDatabase = Kysely<MetadataSchema>
