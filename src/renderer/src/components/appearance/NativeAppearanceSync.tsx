import { isAppearanceMode } from '@shared/appAppearance'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

export const NativeAppearanceSync = () => {
  const { resolvedTheme, theme, setTheme } = useTheme()
  useEffect(() => {
    if (theme && !isAppearanceMode(theme)) setTheme('system')
    return window.brainstorming?.onSystemThemeChanged(() => {
      // Re-resolve through the library while persisting the user's "system" choice.
      if (theme === 'system') setTheme('system')
    })
  }, [theme, setTheme])
  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    void window.brainstorming?.setAppearance(resolvedTheme).catch(() => {
      // A cosmetic native caption update must not interrupt document editing.
    })
  }, [resolvedTheme])
  return null
}
