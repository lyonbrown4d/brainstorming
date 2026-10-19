import { APPEARANCE_STORAGE_KEY } from '@shared/appAppearance'

/** Shared appearance setup for the independent splash and pre-React main loading screen. */
export const initializeAppearance = (): void => {
  try {
    const preference = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (preference === 'light' || preference === 'dark') {
      document.documentElement.dataset.theme = preference
      document.documentElement.style.colorScheme = preference
    }
  } catch {
    // CSS follows the OS when storage is unavailable; the library manages the mounted app.
  }
}
