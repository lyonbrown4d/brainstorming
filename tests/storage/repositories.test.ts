import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { AppLanguage } from '@shared/language'
import type { RecoveryEntry } from '@main/workspace-recovery/repository'
import { openDatabase, recoveryEntry, storageDirectory } from '@tests/storage/fixtures'

describe('SQLite application metadata repositories', () => {
  it('creates an empty database and persists ordered metadata across reopening', async () => {
    const directory = await storageDirectory()
    const first = openDatabase(directory)
    expect(await first.preferences.getLanguage()).toBeNull()
    expect(await first.recentFiles.read()).toEqual([])
    expect(await first.recoveryIndex.read()).toEqual([])
    const recent = [
      '/maps/second.brainstorming',
      "/maps/quote'); DROP TABLE preferences;--.brainstorming",
    ]
    const entries = [recoveryEntry('second'), recoveryEntry('first')]
    await first.preferences.setLanguage('zh-CN')
    await first.preferences.setLanguage('en')
    await first.recentFiles.replace(recent)
    await first.recoveryIndex.replace(entries)
    first.close()
    first.close()
    const reopened = openDatabase(directory)
    expect(await reopened.preferences.getLanguage()).toBe('en')
    expect(await reopened.recentFiles.read()).toEqual(recent)
    expect(await reopened.recoveryIndex.read()).toEqual(entries)
    await reopened.recentFiles.replace([])
    await reopened.recoveryIndex.replace([])
    expect(await reopened.recentFiles.read()).toEqual([])
    expect(await reopened.recoveryIndex.read()).toEqual([])
  })

  it('validates languages and bounded unique recent paths before replacing saved data', async () => {
    const database = openDatabase(await storageDirectory())
    await database.preferences.setLanguage('zh-CN')
    await expect(database.preferences.setLanguage('fr' as AppLanguage)).rejects.toThrow()
    expect(await database.preferences.getLanguage()).toBe('zh-CN')
    const maximum = Array.from({ length: 10 }, (_, index) => `/maps/${index}.brainstorming`)
    await database.recentFiles.replace(maximum)
    for (const invalid of [
      [...maximum, '/extra'],
      ['/duplicate', '/duplicate'],
      [''],
      ['bad\0path'],
    ])
      await expect(database.recentFiles.replace(invalid)).rejects.toThrow()
    expect(await database.recentFiles.read()).toEqual(maximum)
  })

  it('rejects unsafe recovery filenames, duplicate documents, versions and overflow', async () => {
    const database = openDatabase(await storageDirectory())
    const maximum = Array.from({ length: 32 }, (_, index) => recoveryEntry(`document-${index}`))
    await database.recoveryIndex.replace(maximum)
    const entry = recoveryEntry('one')
    const invalidIndexes: readonly RecoveryEntry[][] = [
      [...maximum, recoveryEntry('extra')],
      [entry, entry],
      [{ ...entry, fileName: '../outside.brainstorming' }],
      [{ ...entry, fileName: recoveryEntry('other').fileName }],
      [{ ...entry, protocolVersion: 1 as 2 }],
    ]
    for (const invalid of invalidIndexes)
      await expect(database.recoveryIndex.replace(invalid)).rejects.toThrow()
    expect(await database.recoveryIndex.read()).toEqual(maximum)
  })

  it('rolls back the deletion if inserting either ordered index fails', async () => {
    const directory = await storageDirectory()
    const database = openDatabase(directory)
    const entries = [recoveryEntry('preserved')]
    await database.recentFiles.replace(['/preserved.brainstorming'])
    await database.recoveryIndex.replace(entries)
    const connection = new Database(path.join(directory, 'brainstorming.sqlite'))
    try {
      connection.exec(`
        CREATE TRIGGER reject_recent BEFORE INSERT ON recent_files
        BEGIN SELECT RAISE(ABORT, 'injected recent failure'); END;
        CREATE TRIGGER reject_recovery BEFORE INSERT ON workspace_recovery
        BEGIN SELECT RAISE(ABORT, 'injected recovery failure'); END;
      `)
      await expect(database.recentFiles.replace(['/replacement.brainstorming'])).rejects.toThrow(
        'injected recent failure',
      )
      await expect(database.recoveryIndex.replace([recoveryEntry('replacement')])).rejects.toThrow(
        'injected recovery failure',
      )
      expect(await database.recentFiles.read()).toEqual(['/preserved.brainstorming'])
      expect(await database.recoveryIndex.read()).toEqual(entries)
    } finally {
      connection.close()
    }
  })

  it('snapshots mutable replacement inputs before asynchronous execution', async () => {
    const database = openDatabase(await storageDirectory())
    const paths = ['/original.brainstorming']
    const entry = recoveryEntry('original')
    const entries = [entry]
    const pendingRecent = database.recentFiles.replace(paths)
    const pendingRecovery = database.recoveryIndex.replace(entries)
    paths[0] = '/mutated.brainstorming'
    entry.documentId = 'mutated'
    await Promise.all([pendingRecent, pendingRecovery])
    expect(await database.recentFiles.read()).toEqual(['/original.brainstorming'])
    expect((await database.recoveryIndex.read())[0]?.documentId).toBe('original')
  })
})
