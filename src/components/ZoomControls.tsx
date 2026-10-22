import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'

import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useStore } from '@xyflow/react'
import { Focus, Minus, Plus, Maximize2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useEditor } from '@renderer/state/editor'
import { requestSpatialCamera } from '@renderer/state/spatialCameraCommands'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

const ZoomPercentage = () => {
  const percent = useStore((state) => Math.round(state.transform[2] * 100))
  return <span className="zoom-value w-11 text-center text-[11px] tabular-nums">{percent}%</span>
}

export const ZoomControls = () => {
  const { translate } = useMessages()

  const reduceMotion = useReducedMotion()
  const flow = useReactFlow<TopicFlowNode>()
  const { view } = useActiveSpatialView()
  const spatial = view.mode === '3d'
  const immediate = Boolean(reduceMotion)
  return (
    <div
      className="canvas-controls flex shrink-0 items-center rounded-lg border border-border/80 bg-background p-0.5 text-secondary-foreground shadow-floating [&_button]:size-7 [&_button]:transition-[background-color,color,transform] [&_button]:duration-150 [&_button]:hover:bg-accent [&_button]:hover:text-foreground [&_button]:active:scale-[0.94]"
      aria-label={translate('canvasView')}
    >
      <Button
        variant="ghost"
        size="icon"
        title={translate('zoomOut')}
        aria-label={translate('zoomOut')}
        onClick={() => {
          if (spatial) requestSpatialCamera('zoomOut')
          else void flow.zoomOut({ duration: immediate ? 0 : 160 })
        }}
      >
        <Minus size={16} />
      </Button>
      {spatial ? (
        <Button
          variant="ghost"
          size="sm"
          className="zoom-value !w-20 text-[11px] tabular-nums"
          title={translate('spatialResetDistance')}
          aria-label={translate('spatialResetDistance')}
          onClick={() => {
            requestSpatialCamera('actualSize')
          }}
        >
          {translate('spatialDistanceShort')}{' '}
          {Math.round(view.cameraDistance ?? 0).toLocaleString()}
        </Button>
      ) : (
        <ZoomPercentage />
      )}
      <Button
        variant="ghost"
        size="icon"
        title={translate('zoomIn')}
        aria-label={translate('zoomIn')}
        onClick={() => {
          if (spatial) requestSpatialCamera('zoomIn')
          else void flow.zoomIn({ duration: immediate ? 0 : 160 })
        }}
      >
        <Plus size={16} />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        title={translate('fitCanvas')}
        aria-label={translate('fitCanvas')}
        onClick={() => {
          if (spatial) requestSpatialCamera('fit')
          else
            void flow.fitView({
              padding: canvasFitPadding(),
              maxZoom: 1.2,
              duration: immediate ? 0 : 250,
            })
        }}
      >
        <Maximize2 size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={translate('focusSelectedTopic')}
        aria-label={translate('focusSelectedTopic')}
        onClick={() => {
          if (spatial) {
            requestSpatialCamera('focusSelected')
            return
          }
          const node = flow.getNode(useEditor.getState().selectedId)
          if (node)
            void flow.setCenter(
              node.position.x + (node.width ?? 160) / 2,
              node.position.y + (node.height ?? 48) / 2,
              { zoom: 1, duration: immediate ? 0 : 250 },
            )
        }}
      >
        <Focus size={16} />
      </Button>
    </div>
  )
}
