import { useEditor } from '@renderer/state/editor'
import { useSelectedDrawingIds, useSelection } from '@renderer/state/selection'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { usePresentation } from '@renderer/state/presentation'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'

/** Both canvases use the same single-topic eligibility and creation commands. */
export const useTopicDirectControls = (): string | undefined => {
  const sheetId = useEditor((state) => state.activeSheetId)
  const primary = useEditor((state) => state.selectedId)
  const selected = useSelection((state) => state.sheets[sheetId])
  const drawings = useSelectedDrawingIds()
  const busy = useEditor((state) => state.busy || Boolean(state.editingId))
  const mode = useCanvasInk((state) => state.mode)
  const playing = usePresentation((state) => state.playing)
  const annotation = useAnnotationInteraction(
    (state) => state.selected?.sheetId === sheetId || state.relationMode || state.floating,
  )
  return busy || playing || annotation || drawings.length || mode !== 'select'
    ? undefined
    : selected
      ? selected.length === 1
        ? selected[0]
        : undefined
      : primary
}
