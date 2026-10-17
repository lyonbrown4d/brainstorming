import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LanguageStore } from '@main/language'
import { LocalDatabase } from '@main/storage/database'
import type { PreferencesRepository } from '@main/storage/repositories'
import { isAppLanguage, languageFromLocale } from '@shared/language'

const directories: string[] = []
const databases: LocalDatabase[] = []
const openDatabase = (directory: string) => {
  const database = new LocalDatabase(directory)
  databases.push(database)
  return database
}
const temporaryDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'brainstorming-language-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('application language preferences', () => {
  it('normalizes Chinese locales and uses English for other systems', () => {
    expect(['zh-CN', 'zh-TW', 'zh_HK', 'zh'].map(languageFromLocale)).toEqual([
      'zh-CN',
      'zh-CN',
      'zh-CN',
      'zh-CN',
    ])
    expect(languageFromLocale('fr-FR')).toBe('en')
    expect(isAppLanguage('en')).toBe(true)
    expect(isAppLanguage('zh-TW')).toBe(false)
  })

  it('persists the selected language across database reopen independently of the system', async () => {
    const directory = await temporaryDirectory()
    const database = openDatabase(directory)
    const store = new LanguageStore(database.preferences, () => 'zh-TW')
    await store.initialize()
    expect(await store.get()).toBe('zh-CN')
    expect(await store.set('en')).toBe('en')
    database.close()
    const reopened = openDatabase(directory)
    const restarted = new LanguageStore(reopened.preferences, 'zh-CN')
    await restarted.initialize()
    expect(await reopened.preferences.getLanguage()).toBe('en')
    expect(await restarted.get()).toBe('en')
  })

  it('retains the active language if writing the preference fails', async () => {
    const preferences: PreferencesRepository = {
      getLanguage: () => Promise.resolve(null),
      setLanguage: () => Promise.reject(new Error('database write failed')),
    }
    const store = new LanguageStore(preferences, 'zh-CN')
    await store.initialize()
    await expect(store.set('en')).rejects.toThrow('database write failed')
    expect(await store.get()).toBe('zh-CN')
  })
})
