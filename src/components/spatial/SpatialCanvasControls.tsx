import type { MindMapLayout } from '@layout'
import { SpatialCameraControls } from '@renderer/components/spatial/SpatialCameraControls'
import { Panel } from '@xyflow/react'
import { RotateCcw } from 'lucide-react'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { DEFAULT_SPATIAL_VIEW } from '@renderer/state/spatialView'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { SpatialDepthControl } from '@renderer/components/spatial/SpatialDepthControl'
import { Button } from '@renderer/components/ui/button'

export const SpatialCanvasControls = ({
  layout,
  depths,
}: {
  layout?: MindMapLayout | undefined
  depths?: Readonly<Record<string, number>> | null | undefined
}) => {
  const { translate } = useMessages()
  const { value: modeValue } = useActiveSpatialSetting((view) => view.mode)
  const busy = useEditor((state) => state.busy)
  const dragging = useCanvasInteraction((state) => Boolean(state.drag))
  const focus = (): void => {
    const id = useEditor.getState().selectedId
    document
      .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true })
  }
  if (modeValue !== '3d') return null
  return (
    <>
      <Panel
        position="top-left"
        className="!m-3 flex items-center gap-1 rounded-lg border border-border/80 bg-background p-1 shadow-floating [&_button]:transition-[background-color,color,transform] [&_button]:duration-150 [&_button]:active:scale-[0.96]"
      >
        <SpatialDepthControl />
        <SpatialCameraControls layout={layout} depths={depths} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy || dragging}
          aria-label={translate('spatialResetCamera')}
          title={translate('spatialResetCamera')}
          onClick={() => {
            saveSpatialView({
              yaw: DEFAULT_SPATIAL_VIEW.yaw,
              pitch: DEFAULT_SPATIAL_VIEW.pitch,
              target: { x: 0, y: 0, z: 0 },
            })
            focus()
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </Panel>
      <Panel
        position="bottom-right"
        className="!m-3 pointer-events-none max-w-[70%] rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] text-secondary-foreground shadow-floating"
      >
        {translate('spatialCameraHint')}
      </Panel>
    </>
  )
}
