import { useEffect, useState } from 'react'
import type { WindowState } from '@shared/window'

/** Synchronize native focus/fullscreen without putting window state into the document. */
export const useWindowChrome = () => {
  const bridge = window.trelyx
  const [state, setState] = useState<WindowState>({ focused: true, fullScreen: false })
  useEffect(() => {
    if (!bridge) return
    let alive = true
    let changed = false
    const unsubscribe = bridge.onWindowStateChanged((next) => {
      changed = true
      setState(next)
    })
    void bridge
      .getWindowState()
      .then((next) => {
        if (alive && !changed) setState(next)
      })
      .catch(() => {
        // Native controls remain usable if this cosmetic state cannot be read.
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [bridge])
  return { ...state, platform: bridge?.platform ?? 'browser' }
}
