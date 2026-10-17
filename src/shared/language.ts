export type AppLanguage = 'zh-CN' | 'en'

export interface LanguageAPI {
  getLanguage(): Promise<AppLanguage>
  setLanguage(language: AppLanguage): Promise<AppLanguage>
}

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'zh-CN' || value === 'en'

export const languageFromLocale = (locale: string): AppLanguage =>
  /^zh(?:[-_]|$)/i.test(locale) ? 'zh-CN' : 'en'
