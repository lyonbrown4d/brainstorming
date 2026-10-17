import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

/** Panels cover the canvas without resizing its rendering surface. */
export const useWorkbenchInsets = () => {
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const playing = usePresentation((state) => state.playing)
  return { left: !playing && outline ? 216 : 0, right: !playing && inspector ? 256 : 0 }
}

export const canvasFitPadding = () => {
  const state = useEditor.getState()
  const playing = usePresentation.getState().playing
  return {
    left: `${(!playing && state.outlineOpen ? 216 : 0) + 24}px` as const,
    right: `${(!playing && state.inspectorOpen ? 256 : 0) + 24}px` as const,
    top: '12%' as const,
    bottom: '12%' as const,
  }
}
