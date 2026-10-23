import type { ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useStore } from '@xyflow/react'
import { Focus, Minus, Plus, Maximize2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { useActiveSpatialView, useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { requestSpatialCamera } from '@renderer/state/spatialCameraCommands'

interface ZoomControlActions {
  zoomOut: () => void
  zoomIn: () => void
  fit: () => void
  focus: () => void
  children: ReactNode
}

const ZoomControlBar = ({ zoomOut, zoomIn, fit, focus, children }: ZoomControlActions) => {
  const { translate } = useMessages()
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
        onClick={zoomOut}
      >
        <Minus size={16} />
      </Button>
      {children}
      <Button
        variant="ghost"
        size="icon"
        title={translate('zoomIn')}
        aria-label={translate('zoomIn')}
        onClick={zoomIn}
      >
        <Plus size={16} />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        title={translate('fitCanvas')}
        aria-label={translate('fitCanvas')}
        onClick={fit}
      >
        <Maximize2 size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={translate('focusSelectedTopic')}
        aria-label={translate('focusSelectedTopic')}
        onClick={focus}
      >
        <Focus size={16} />
      </Button>
    </div>
  )
}

const ZoomPercentage = () => {
  const percent = useStore((state) => Math.round(state.transform[2] * 100))
  return <span className="zoom-value w-11 text-center text-[11px] tabular-nums">{percent}%</span>
}

const PlanarZoomControls = () => {
  const reduceMotion = useReducedMotion()
  const flow = useReactFlow<TopicFlowNode>()
  const immediate = Boolean(reduceMotion)
  return (
    <ZoomControlBar
      zoomOut={() => void flow.zoomOut({ duration: immediate ? 0 : 160 })}
      zoomIn={() => void flow.zoomIn({ duration: immediate ? 0 : 160 })}
      fit={() =>
        void flow.fitView({
          padding: canvasFitPadding(),
          maxZoom: 1.2,
          duration: immediate ? 0 : 250,
        })
      }
      focus={() => {
        const node = flow.getNode(useEditor.getState().selectedId)
        if (node)
          void flow.setCenter(
            node.position.x + (node.width ?? 160) / 2,
            node.position.y + (node.height ?? 48) / 2,
            { zoom: 1, duration: immediate ? 0 : 250 },
          )
      }}
    >
      <ZoomPercentage />
    </ZoomControlBar>
  )
}

const SpatialZoomControls = () => {
  const { translate } = useMessages()
  const { view } = useActiveSpatialView()
  return (
    <ZoomControlBar
      zoomOut={() => {
        requestSpatialCamera('zoomOut')
      }}
      zoomIn={() => {
        requestSpatialCamera('zoomIn')
      }}
      fit={() => {
        requestSpatialCamera('fit')
      }}
      focus={() => {
        requestSpatialCamera('focusSelected')
      }}
    >
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
        {translate('spatialDistanceShort')} {Math.round(view.cameraDistance ?? 0).toLocaleString()}
      </Button>
    </ZoomControlBar>
  )
}

export const ZoomControls = ({ mode: requestedMode }: { mode?: '2d' | '3d' }) => {
  const { value: observedMode } = useActiveSpatialSetting((view) => view.mode)
  const mode = requestedMode ?? observedMode
  return mode === '3d' ? <SpatialZoomControls /> : <PlanarZoomControls />
}
