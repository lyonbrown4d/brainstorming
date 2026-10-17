import type { NativeConnection } from '@main/document-db/connection'
import { assertObjectId } from '@main/document-db/resources'

/** Explicit maintenance only. Callers must supply every object pinned by unsaved/undo state. */
export const compactDocument = async (
  db: NativeConnection,
  pinnedObjectIds: readonly string[],
): Promise<{ removedObjects: number }> => {
  for (const id of pinnedObjectIds) assertObjectId(id)
  await db.exec('BEGIN IMMEDIATE')
  let removedObjects: number
  try {
    await db.exec('CREATE TEMP TABLE native_compaction_keep (id TEXT PRIMARY KEY)')
    await db
      .prepare(
        'INSERT INTO native_compaction_keep SELECT object_id FROM resources UNION SELECT object_id FROM revision_resources UNION SELECT value FROM json_each(?)',
      )
      .run(JSON.stringify(pinnedObjectIds))
    // Current protocol derivatives are one level below an immutable original object.
    await db.exec(
      'INSERT OR IGNORE INTO native_compaction_keep SELECT variant_object_id FROM resource_variants WHERE object_id IN (SELECT id FROM native_compaction_keep)',
    )
    await db.exec(
      'INSERT OR IGNORE INTO native_compaction_keep SELECT tile_object_id FROM image_tiles WHERE object_id IN (SELECT id FROM native_compaction_keep)',
    )
    const count = (await db
      .prepare(
        'SELECT count(*) AS count FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep)',
      )
      .get()) as { count: number }
    removedObjects = count.count
    await db.exec(
      'DELETE FROM resource_chunks WHERE object_id NOT IN (SELECT id FROM native_compaction_keep)',
    )
    await db.exec(
      'DELETE FROM resource_variants WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR variant_object_id NOT IN (SELECT id FROM native_compaction_keep)',
    )
    await db.exec(
      'DELETE FROM image_tiles WHERE object_id NOT IN (SELECT id FROM native_compaction_keep) OR tile_object_id NOT IN (SELECT id FROM native_compaction_keep)',
    )
    await db.exec(
      'DELETE FROM resource_objects WHERE id NOT IN (SELECT id FROM native_compaction_keep)',
    )
    await db.exec('DROP TABLE native_compaction_keep')
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
  await db.exec('VACUUM')
  return { removedObjects }
}
