import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useViewport } from '@xyflow/react'
import { Focus, Minus, Plus, Maximize2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useEditor } from '@renderer/state/editor'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

export const ZoomControls = () => {
  const reduceMotion = useReducedMotion()
  const flow = useReactFlow<TopicFlowNode>()
  const { zoom } = useViewport()
  return (
    <div
      className="canvas-controls flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 text-muted-foreground [&_button]:size-7"
      aria-label="画布视图"
    >
      <Button
        variant="ghost"
        size="icon"
        title="缩小"
        aria-label="缩小"
        onClick={() => void flow.zoomOut({ duration: reduceMotion ? 0 : 160 })}
      >
        <Minus size={16} />
      </Button>
      <span className="zoom-value w-11 text-center text-xs tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        title="放大"
        aria-label="放大"
        onClick={() => void flow.zoomIn({ duration: reduceMotion ? 0 : 160 })}
      >
        <Plus size={16} />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon"
        title="适应画布"
        aria-label="适应画布"
        onClick={() =>
          void flow.fitView({
            padding: canvasFitPadding(),
            maxZoom: 1.2,
            duration: reduceMotion ? 0 : 250,
          })
        }
      >
        <Maximize2 size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="聚焦选中主题"
        aria-label="聚焦选中主题"
        onClick={() => {
          const node = flow.getNode(useEditor.getState().selectedId)
          if (node)
            void flow.setCenter(
              node.position.x + (node.width ?? 160) / 2,
              node.position.y + (node.height ?? 48) / 2,
              { zoom: 1, duration: reduceMotion ? 0 : 250 },
            )
        }}
      >
        <Focus size={16} />
      </Button>
    </div>
  )
}
