import { useMessages } from '@renderer/i18n/useMessages'
import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { InkFlowNode } from '@renderer/lib/canvasNodes'
import { inkGeometry } from '@shared/ink-geometry'
import { useInkResize } from '@renderer/hooks/useInkResize'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

const InkNodeContent = ({ id, data, selected }: NodeProps<InkFlowNode>) => {
  const { translate } = useMessages()
  const { stroke } = data
  const { path, bounds } = inkGeometry(stroke)
  const mode = useCanvasInk((state) => state.mode)
  const busy = useEditor((state) => state.busy)
  const playing = usePresentation((state) => state.playing)
  const resize = useInkResize(id, stroke)
  const active = !busy && !playing
  return (
    <>
      <NodeResizer
        {...resize}
        isVisible={selected && mode === 'select' && active}
        minWidth={1}
        minHeight={1}
        maxWidth={1_000_000}
        maxHeight={1_000_000}
        color="var(--color-primary)"
        handleClassName="!size-2.5 !rounded-sm !border-background"
        handleStyle={{ pointerEvents: 'all' }}
        lineStyle={{ pointerEvents: 'all' }}
      />
      <svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="none"
        className="nopan block size-full overflow-visible"
        data-ink-node={stroke.id}
        aria-label={translate('inkStroke')}
        style={{ pointerEvents: selected && mode === 'select' ? 'auto' : 'none' }}
      >
        <path
          d={path}
          fill={stroke.color}
          stroke="transparent"
          strokeWidth={8}
          vectorEffect="non-scaling-stroke"
          data-drawing-id={stroke.id}
          data-canvas-stroke={stroke.id}
          style={{
            pointerEvents: active && mode !== 'pen' ? 'visiblePainted' : 'none',
            cursor: mode === 'eraser' ? 'crosshair' : 'move',
          }}
          onPointerDown={(event) => {
            if (!active || mode !== 'eraser' || event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            useEditor.getState().command({ type: 'removeDrawing', drawingId: stroke.id })
          }}
        />
      </svg>
    </>
  )
}

// The SVG fills React Flow's box; camera-only projection never changes the stroke content.
export const InkNode = memo(
  InkNodeContent,
  (previous, next) =>
    previous.id === next.id &&
    previous.selected === next.selected &&
    previous.data.stroke === next.data.stroke,
)
InkNode.displayName = 'InkNode'
