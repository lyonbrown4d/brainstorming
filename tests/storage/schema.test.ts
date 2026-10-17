import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { LocalDatabase } from '@main/storage/database'
import { openDatabase, recoveryEntry, storageDirectory } from '@tests/storage/fixtures'

describe('SQLite metadata lifecycle and schema', () => {
  it('enables WAL and creates only constrained metadata tables', async () => {
    const directory = await storageDirectory()
    const database = openDatabase(path.join(directory, 'nested'))
    await database.preferences.setLanguage('en')
    const connection = new Database(path.join(directory, 'nested', 'brainstorming-local.sqlite'))
    try {
      expect(connection.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(connection.pragma('user_version', { simple: true })).toBe(0)
      expect(
        connection
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all(),
      ).toEqual([
        { name: 'kysely_migration' },
        { name: 'kysely_migration_lock' },
        { name: 'preferences' },
        { name: 'recent_files' },
        { name: 'workspace_recovery' },
      ])
      expect(connection.prepare('SELECT name FROM kysely_migration').all()).toEqual([
        { name: '001-metadata' },
      ])
      expect(connection.prepare('SELECT is_locked FROM kysely_migration_lock').get()).toEqual({
        is_locked: 0,
      })
      expect(() => connection.prepare('INSERT INTO preferences VALUES (2, ?)').run('en')).toThrow()
      expect(() =>
        connection.prepare('UPDATE preferences SET language = ?').run('invalid'),
      ).toThrow()
      expect(() =>
        connection.prepare('INSERT INTO recent_files VALUES (10, ?)').run('/map'),
      ).toThrow()
      const entry = recoveryEntry('one')
      const insert = connection.prepare('INSERT INTO workspace_recovery VALUES (?, ?, ?, ?)')
      insert.run(0, entry.documentId, entry.fileName, 2)
      expect(() => insert.run(1, 'two', entry.fileName, 2)).toThrow()
      expect(() => insert.run(32, 'three', 'three.brainstorming', 2)).toThrow()
      expect(() => insert.run(1, 'three', 'three.brainstorming', 1)).toThrow()
      insert.run(1, 'three', '../outside.brainstorming', 2)
      await expect(database.recoveryIndex.read()).rejects.toThrow('工作区恢复索引损坏')
    } finally {
      connection.close()
    }
  })

  it('rejects unknown schema versions and leaves their data intact', async () => {
    const directory = await storageDirectory()
    const file = path.join(directory, 'brainstorming-local.sqlite')
    const existing = new Database(file)
    existing.exec("CREATE TABLE future_data (value TEXT); INSERT INTO future_data VALUES ('kept')")
    existing.pragma('user_version = 42')
    existing.close()
    expect(() => new LocalDatabase(directory)).toThrow('Unsupported local database schema')
    const connection = new Database(file)
    try {
      expect(connection.pragma('user_version', { simple: true })).toBe(42)
      expect(connection.prepare('SELECT value FROM future_data').get()).toEqual({ value: 'kept' })
      expect(connection.pragma('journal_mode', { simple: true })).toBe('delete')
    } finally {
      connection.close()
    }
  })

  it('rejects an unversioned nonempty database and damaged bytes without overwriting either', async () => {
    const directory = await storageDirectory()
    const file = path.join(directory, 'brainstorming-local.sqlite')
    const existing = new Database(file)
    existing.exec('CREATE TABLE unknown_data (value TEXT)')
    existing.close()
    expect(() => new LocalDatabase(directory)).toThrow('Unrecognized local database schema')
    const before = Buffer.from('this is not a SQLite database')
    await writeFile(file, before)
    expect(() => new LocalDatabase(directory)).toThrow()
    expect(await readFile(file)).toEqual(before)
  })

  it('rejects a migration from a newer application without changing metadata', async () => {
    const directory = await storageDirectory()
    const database = openDatabase(directory)
    await database.preferences.setLanguage('zh-CN')
    database.close()
    const file = path.join(directory, 'brainstorming-local.sqlite')
    const connection = new Database(file)
    try {
      connection
        .prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)')
        .run('999-future', new Date().toISOString())
      expect(() => new LocalDatabase(directory)).toThrow('Unsupported local database schema')
      expect(connection.prepare('SELECT language FROM preferences').get()).toEqual({
        language: 'zh-CN',
      })
      expect(connection.prepare('SELECT name FROM kysely_migration ORDER BY name').all()).toEqual([
        { name: '001-metadata' },
        { name: '999-future' },
      ])
    } finally {
      connection.close()
    }
  })

  it('starts with fresh metadata when a legacy database exists', async () => {
    const directory = await storageDirectory()
    const legacy = new Database(path.join(directory, 'brainstorming.sqlite'))
    try {
      legacy.exec(
        "CREATE TABLE preferences (id INTEGER PRIMARY KEY, language TEXT); INSERT INTO preferences VALUES (1, 'en')",
      )
      legacy.pragma('user_version = 1')
      const database = openDatabase(directory)
      expect(await database.preferences.getLanguage()).toBeNull()
      await database.preferences.setLanguage('zh-CN')
      expect(legacy.prepare('SELECT language FROM preferences').get()).toEqual({ language: 'en' })
    } finally {
      legacy.close()
    }
  })

  it('rejects operations after close without recreating the database', async () => {
    const database = openDatabase(await storageDirectory())
    database.close()
    database.close()
    await expect(database.preferences.setLanguage('en')).rejects.toThrow()
    await expect(database.recentFiles.read()).rejects.toThrow()
    await expect(database.recoveryIndex.replace([])).rejects.toThrow()
  })
})
