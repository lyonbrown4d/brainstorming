import { isAppLanguage, languageFromLocale, type AppLanguage } from '@shared/language'
import type { PreferencesRepository } from '@main/storage/repositories'

/** Application preference only: never stored in a workbook or recovery history. */
export class LanguageStore {
  private language: AppLanguage = 'en'
  constructor(
    private readonly preferences: PreferencesRepository,
    private readonly systemLocale: string | (() => string),
  ) {}

  initialize = async (): Promise<void> => {
    const stored = await this.preferences.getLanguage()
    this.language =
      stored ??
      languageFromLocale(
        typeof this.systemLocale === 'function' ? this.systemLocale() : this.systemLocale,
      )
  }

  get = (): Promise<AppLanguage> => Promise.resolve(this.language)

  set = async (language: AppLanguage): Promise<AppLanguage> => {
    if (!isAppLanguage(language)) throw new TypeError('Unsupported application language')
    await this.preferences.setLanguage(language)
    this.language = language
    return language
  }
}
