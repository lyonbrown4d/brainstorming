export const APPEARANCE_STORAGE_KEY = 'trelyx-appearance'
export type AppearanceMode = 'light' | 'dark' | 'system'
export const isAppearanceMode = (value: unknown): value is AppearanceMode =>
  value === 'light' || value === 'dark' || value === 'system'
