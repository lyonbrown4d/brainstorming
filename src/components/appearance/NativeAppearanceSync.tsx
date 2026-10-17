import { requireDesktopAPI } from '@renderer/lib/desktop'
import { isAppearanceMode } from '@shared/appAppearance'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

export const NativeAppearanceSync = () => {
  const { resolvedTheme, theme, setTheme } = useTheme()
  useEffect(() => {
    if (theme && !isAppearanceMode(theme)) setTheme('system')
    return requireDesktopAPI().onSystemThemeChanged(() => {
      // Re-resolve through the library while persisting the user's "system" choice.
      if (theme === 'system') setTheme('system')
    })
  }, [theme, setTheme])
  useEffect(() => {
    if (!isAppearanceMode(theme)) return
    const nativeTheme = theme === 'system' ? 'system' : resolvedTheme
    if (!isAppearanceMode(nativeTheme)) return
    void requireDesktopAPI()
      .setAppearance(nativeTheme)
      .catch(() => {
        // A cosmetic native caption update must not interrupt document editing.
      })
  }, [theme, resolvedTheme])
  return null
}
