import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { MindMapWorkbook } from '@core/types'
import { encodeBrainstorming } from '@formats/brainstorming'

/** Mutates a genuine SQLite fixture to exercise the untrusted document boundary. */
export const mutateNative = async (
  workbook: MindMapWorkbook,
  mutate: (db: Database.Database) => void,
): Promise<Uint8Array> => {
  const directory = await mkdtemp(join(tmpdir(), 'native-corrupt-'))
  const path = join(directory, 'document.brainstorming')
  try {
    await writeFile(path, await encodeBrainstorming(workbook))
    const db = new Database(path)
    try {
      mutate(db)
    } finally {
      db.close()
    }
    return await readFile(path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
