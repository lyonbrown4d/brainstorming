import { useEffect } from 'react'
import { dismissStartupScreen } from '@renderer/startupStatus'

/** Keep the static splash until the application has committed and painted its first frame. */
export const useStartupScreen = (): void => {
  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        dismissStartupScreen(document)
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [])
}
