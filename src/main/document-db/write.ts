import {
  captureStructure,
  restoreAfterRekeyFailure,
  pruneRevisions,
  type StructuralSnapshot,
} from '@main/document-db/rekey-rollback'
import { randomUUID } from 'node:crypto'
import type { MindMapWorkbook } from '@core/types'
import { validateAssetContent } from '@formats/brainstorming/assets'
import { validateBoundedWorkbook } from '@formats/brainstorming/validation'
import { fileIdentity, removeFailedCreation } from '@main/document-db/creation'
import type { NativeDocumentPools } from '@main/document-db/pool'
import { STRUCTURAL_TABLES, structuralRows, synchronizeRows } from '@main/document-db/rows'
import { writeResources } from '@main/document-db/resources'
import type { NativeWriteOptions } from '@main/document-db/types'

export const writeDocument = async (
  pools: NativeDocumentPools,
  path: string,
  workbook: MindMapWorkbook,
  options: NativeWriteOptions = {},
  allowRetry = true,
): Promise<void> => {
  validateBoundedWorkbook(workbook)
  validateAssetContent(workbook)
  const rows = structuralRows(workbook)
  const password =
    options.existingPassword === undefined
      ? options.password
      : (options.existingPassword ?? undefined)
  const previousFile = await fileIdentity(path)
  const attempt = { createdHere: false }
  try {
    await pools.withDatabase(path, password, true, async (db) => {
      const existing = (await db.prepare('SELECT count(*) AS count FROM document').get()) as {
        count: number
      }
      const createdIdentity =
        !previousFile && existing.count === 0 ? await fileIdentity(path) : undefined
      attempt.createdHere = createdIdentity !== undefined
      const revision = randomUUID()
      const changingKey = password !== options.password
      let previousStructure: StructuralSnapshot | undefined
      await db.exec('BEGIN IMMEDIATE')
      try {
        if (changingKey) previousStructure = await captureStructure(db)
        rows.resources = await writeResources(db, workbook, options)
        // Temporary negative positions avoid conflicts when sheets exchange order.
        await db.prepare('UPDATE sheets SET position = -position - 1').run()
        for (const table of STRUCTURAL_TABLES) await synchronizeRows(db, table, rows[table])
        await db
          .prepare('INSERT INTO document_revisions VALUES (?,?,?)')
          .run(revision, new Date().toISOString(), JSON.stringify(rows))
        await db
          .prepare(
            `INSERT INTO revision_resources SELECT ?,object_id FROM resources UNION SELECT ?,variant_object_id FROM resource_variants WHERE object_id IN (SELECT object_id FROM resources) UNION SELECT ?,tile_object_id FROM image_tiles WHERE object_id IN (SELECT object_id FROM resources)`,
          )
          .run(revision, revision, revision)
        if (!changingKey) await pruneRevisions(db)
        await db.exec('COMMIT')
      } catch (error) {
        await db.exec('ROLLBACK')
        if (createdIdentity) await removeFailedCreation(db, path, createdIdentity)
        throw error
      }
      if (changingKey) {
        try {
          if (options.password) db.driver.pragma("cipher = 'sqlcipher'")
          db.driver.rekey(Buffer.from(options.password ?? ''))
        } catch (cause) {
          try {
            if (!previousStructure) throw new Error('缺少密码变更前的文档结构', { cause })
            await restoreAfterRekeyFailure(
              path,
              password,
              previousStructure,
              revision,
              createdIdentity,
            )
          } catch (rollback) {
            throw new AggregateError(
              [cause, rollback],
              '密码变更失败，旧密钥验证或文档内容回滚失败',
              { cause: rollback },
            )
          }
          throw cause
        }
        // History cleanup is retried on the next save if it fails after the durable content/key change.
        try {
          await db.exec('BEGIN IMMEDIATE')
          await pruneRevisions(db)
          await db.exec('COMMIT')
        } catch {
          if (db.driver.inTransaction) await db.exec('ROLLBACK')
        }
      }
    })
  } catch (error) {
    if (!previousFile || password !== options.password) await pools.release(path)
    if (!previousFile) {
      // Another failed first writer may have retired the shared empty inode while this call queued.
      if (allowRetry && !attempt.createdHere && !(await fileIdentity(path)))
        return writeDocument(pools, path, workbook, options, false)
    }
    throw error
  }
  if (password !== options.password) await pools.release(path)
}
