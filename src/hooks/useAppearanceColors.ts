import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/** Three.js needs concrete colors; keep CSS theme variables as their single source. */
export const useAppearanceColors = () => {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState({
    surface: '#ffffff',
    foreground: '#272832',
    accent: '#f0eef9',
    border: '#e7e7ed',
  })
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback
    const sync = () => {
      setColors({
        surface: read('--ui-background', '#ffffff'),
        foreground: read('--ui-muted-foreground', '#707580'),
        accent: read('--ui-accent', '#f0eef9'),
        border: read('--ui-border', '#e7e7ed'),
      })
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      observer.disconnect()
    }
  }, [resolvedTheme])
  return colors
}
