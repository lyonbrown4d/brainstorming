import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { usePresentation } from '@renderer/state/presentation'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'

/** The titlebar selects the persisted mode; the mounted canvas restores its own viewport. */
export const SpatialModeSwitch = () => {
  const { translate } = useMessages()
  const { view } = useActiveSpatialView()
  const busy = useEditor((state) => state.busy)
  const dragging = useCanvasInteraction((state) => Boolean(state.drag))
  const presenting = usePresentation((state) => state.workspaceMode !== null)
  return (
    <ToggleGroup
      type="single"
      value={view.mode}
      size="sm"
      disabled={busy || dragging || presenting}
      aria-label={translate('canvasView')}
      data-no-drag
      data-tauri-drag-region="false"
      className="justify-self-center rounded-md bg-muted/60 p-0.5"
      onValueChange={(mode) => {
        if (mode === '2d' || mode === '3d') saveSpatialView({ mode })
      }}
    >
      <ToggleGroupItem
        value="2d"
        aria-label={translate('spatial2d')}
        className="h-7 min-w-9 px-2 text-xs"
      >
        2D
      </ToggleGroupItem>
      <ToggleGroupItem
        value="3d"
        aria-label={translate('spatial3d')}
        className="h-7 min-w-9 px-2 text-xs"
      >
        3D
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
