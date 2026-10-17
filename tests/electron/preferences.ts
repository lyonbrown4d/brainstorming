import { storageOperation } from '@tests/electron/storage'
import { isAppLanguage, type AppLanguage } from '@shared/language'

/** Keep Chinese selectors deterministic regardless of the test machine's OS language. */
export const seedChinese = async (directory: string): Promise<void> => {
  await storageOperation('language:set', directory, 'zh-CN')
}
export const storedLanguage = async (directory: string): Promise<AppLanguage | null> => {
  const language = await storageOperation('language:get', directory)
  if (language === null || isAppLanguage(language)) return language
  throw new Error('Invalid stored test language')
}
