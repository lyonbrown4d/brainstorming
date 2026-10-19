import { useEffect } from 'react'
import { dismissStartupScreen } from '@renderer/startupHandoff'

/** Hidden WKWebViews suspend animation frames. Signal after the React commit so
 * the native host can show the prepared window and finish its splash handoff. */
export const useStartupScreen = (): void => {
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) dismissStartupScreen(document)
    })
    return () => {
      cancelled = true
    }
  }, [])
}
