import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

const defaults = {
  surface: '#ffffff',
  canvas: '#f7f7f2',
  foreground: '#696871',
  accent: '#ecebe6',
  primary: '#3b3e45',
  border: '#e4e3df',
  dropTarget: '#4b866b',
}

/** DOM overlays and Three.js share the concrete values of the CSS semantic tokens. */
export const useAppearanceColors = () => {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState(defaults)
  useEffect(() => {
    const sync = () => {
      const styles = getComputedStyle(document.documentElement)
      const read = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback
      setColors({
        surface: read('--ui-background', defaults.surface),
        canvas: read('--ui-canvas', defaults.canvas),
        foreground: read('--ui-muted-foreground', defaults.foreground),
        accent: read('--ui-accent', defaults.accent),
        primary: read('--ui-primary', defaults.primary),
        border: read('--ui-border', defaults.border),
        dropTarget: read('--ui-drop-target', defaults.dropTarget),
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
