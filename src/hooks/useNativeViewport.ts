import { useEditor } from '@renderer/state/editor'
import { useEffect } from 'react'

/** Visual viewport follows the keyboard; safe areas are applied by the shell. */
export const useNativeViewport = (): void => {
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      useEditor.setState({ inspectorOpen: false, outlineOpen: false })
    }
    const viewport = window.visualViewport
    const update = (): void => {
      document.documentElement.style.setProperty(
        '--app-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
    }
    update()
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--app-height')
    }
  }, [])
}
