import Database from 'better-sqlite3'
import { NativeConnection } from '@main/document-db/connection'
import { checkProtocol } from '@main/document-db/pool'
import { removeFailedCreation } from '@main/document-db/creation'
import {
  STRUCTURAL_TABLES,
  synchronizeRows,
  type NativeRow,
  type StructuralTable,
} from '@main/document-db/rows'
import type { Stats } from 'node:fs'

export type StructuralSnapshot = Record<StructuralTable, NativeRow[]>
export const captureStructure = async (db: NativeConnection): Promise<StructuralSnapshot> =>
  Object.fromEntries(
    await Promise.all(
      STRUCTURAL_TABLES.map(async (table) => [
        table,
        await db.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    ),
  ) as StructuralSnapshot

/** A separate old-key connection confirms the file remains readable before any compensating write. */
export const restoreAfterRekeyFailure = async (
  path: string,
  password: string | undefined,
  snapshot: StructuralSnapshot,
  revision: string,
  createdIdentity: Stats | undefined,
): Promise<void> => {
  const db = new NativeConnection(new Database(path, { fileMustExist: true }))
  try {
    if (password) {
      db.driver.pragma("cipher = 'sqlcipher'")
      db.driver.key(Buffer.from(password))
    }
    await checkProtocol(db)
    await db.exec('BEGIN IMMEDIATE')
    try {
      await db.prepare('UPDATE sheets SET position = -position - 1').run()
      for (const table of STRUCTURAL_TABLES) await synchronizeRows(db, table, snapshot[table])
      await db.prepare('DELETE FROM revision_resources WHERE revision_id = ?').run(revision)
      await db.prepare('DELETE FROM document_revisions WHERE id = ?').run(revision)
      await db.exec('COMMIT')
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    }
    if (createdIdentity && snapshot.document.length === 0)
      await removeFailedCreation(db, path, createdIdentity)
  } finally {
    await db.close()
  }
}

export const pruneRevisions = async (db: NativeConnection): Promise<void> => {
  await db
    .prepare(
      'DELETE FROM revision_resources WHERE revision_id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)',
    )
    .run()
  await db
    .prepare(
      'DELETE FROM document_revisions WHERE id IN (SELECT id FROM document_revisions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)',
    )
    .run()
}
