import { OUTLINE_WIDTH, INSPECTOR_WIDTH } from '@shared/workbench'
import { useCompactLayout } from '@renderer/hooks/useCompactLayout'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

/** Panels cover the canvas without resizing its rendering surface. */
export const useWorkbenchInsets = () => {
  const compact = useCompactLayout()
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const playing = usePresentation((state) => state.playing)
  return {
    left: !compact && !playing && outline ? OUTLINE_WIDTH : 0,
    right: !compact && !playing && inspector ? INSPECTOR_WIDTH : 0,
  }
}

export const canvasFitPadding = () => {
  const compact = window.matchMedia('(max-width: 767px)').matches
  const state = useEditor.getState()
  const playing = usePresentation.getState().playing
  return {
    left: `${(!compact && !playing && state.outlineOpen ? OUTLINE_WIDTH : 0) + 24}px` as const,
    right: `${(!compact && !playing && state.inspectorOpen ? INSPECTOR_WIDTH : 0) + 24}px` as const,
    top: '12%' as const,
    bottom: '12%' as const,
  }
}
