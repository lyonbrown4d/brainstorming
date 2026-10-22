import { CornerDownRight, ListPlus } from 'lucide-react'
import { NodeToolbar, Position, useInternalNode, ViewportPortal } from '@xyflow/react'
import { CanvasDropConnection } from '@renderer/components/workbench/CanvasDropConnection'
import type { CanvasDrop } from '@renderer/lib/canvasDrop'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import {
  canvasDragMessage,
  useCanvasInteraction,
  type CanvasDragInteraction,
} from '@renderer/state/canvasInteraction'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'

const DropTargetPreview = ({ drag, drop }: { drag: CanvasDragInteraction; drop: CanvasDrop }) => {
  // Subscribe only to the candidate nodes, never the complete moving canvas.
  const target = useInternalNode<TopicFlowNode>(drop.targetId)
  const parent = useInternalNode<TopicFlowNode>(drop.parentId)
  const { translate } = useMessages()
  if (!target) return null
  const { x, y } = target.internals.positionAbsolute
  const width = target.measured.width ?? target.width ?? 160
  const height = target.measured.height ?? target.height ?? 48
  const sibling = drop.index !== undefined
  const Icon = sibling ? ListPlus : CornerDownRight
  const indicator = drop.indicator
  const horizontal = indicator?.axis === 'x'
  const after = indicator?.edge === 'after'
  return (
    <>
      <ViewportPortal>
        {drag.roots.slice(0, 24).map((id) => (
          <CanvasDropConnection key={id} rootId={id} parentId={drop.parentId} />
        ))}
        <div
          aria-hidden="true"
          data-testid="drop-preview"
          data-drop-mode={sibling ? 'sibling' : 'child'}
          data-parent-id={drop.parentId}
          data-drop-predicted={drop.predicted ? 'true' : 'false'}
          className="pointer-events-none absolute z-[1001] rounded-xl border-2 border-dashed border-drop-target bg-drop-target/10"
          style={{ left: x - 5, top: y - 5, width: width + 10, height: height + 10 }}
        />
        {sibling && parent && parent.id !== target.id && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[1001] rounded-xl outline-2 outline-offset-4 outline-drop-target"
            style={{
              left: parent.internals.positionAbsolute.x,
              top: parent.internals.positionAbsolute.y,
              width: parent.measured.width ?? parent.width,
              height: parent.measured.height ?? parent.height,
            }}
          />
        )}
        {indicator && (
          <div
            aria-hidden="true"
            data-testid="drop-insertion"
            className="pointer-events-none absolute z-[1002] rounded-full bg-drop-target"
            style={{
              left: horizontal ? x + (after ? width + 10 : -10) - 2 : x - 10,
              top: horizontal ? y - 10 : y + (after ? height + 10 : -10) - 2,
              width: horizontal ? 4 : width + 20,
              height: horizontal ? height + 20 : 4,
            }}
          />
        )}
      </ViewportPortal>
      <NodeToolbar
        nodeId={target.id}
        isVisible
        position={Position.Top}
        align="start"
        offset={20}
        className="pointer-events-none z-[1003] flex max-w-80 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background shadow-md"
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{canvasDragMessage(drag, translate)}</span>
      </NodeToolbar>
    </>
  )
}

/** Explain the resulting hierarchy at the actual drop target, next to the pointer. */
export const CanvasDropPreview = () => {
  const drag = useCanvasInteraction((state) => state.drag)
  const document = useEditor((state) => state.history.document)
  const sheetId = useEditor((state) => state.activeSheetId)
  return drag?.drop && drag.document === document && drag.sheetId === sheetId ? (
    <DropTargetPreview drag={drag} drop={drag.drop} />
  ) : null
}
