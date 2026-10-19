import { useEventListener } from 'ahooks'
import { useLocation } from 'react-router'
import { isCompositionKey } from '@renderer/state/keyboard'
import {
  closeCommandPalette,
  openCommandPalette,
  useCommandPaletteState,
} from '@renderer/state/commandPalette'

/** Only the palette shortcut is global; command navigation belongs to cmdk. */
export const useCommandPalette = (): void => {
  const { pathname } = useLocation()
  useEventListener(
    'keydown',
    (event) => {
      if (
        event.defaultPrevented ||
        isCompositionKey(event) ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return
      if (useCommandPaletteState.getState().open) {
        event.preventDefault()
        event.stopPropagation()
        closeCommandPalette()
      } else if (openCommandPalette(pathname)) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { target: () => window, capture: true },
  )
}
