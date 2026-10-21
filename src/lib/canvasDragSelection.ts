import type { OnNodeDrag, ReactFlowProps } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

type SelectionDragHandlers = Pick<
  ReactFlowProps<CanvasFlowNode>,
  'onSelectionDragStart' | 'onSelectionDrag' | 'onSelectionDragStop'
>

/** Selection drag events use the same command lifecycle as a single node. */
export const canvasDragSelection = (
  onStart: OnNodeDrag<CanvasFlowNode>,
  onMove: OnNodeDrag<CanvasFlowNode>,
  onStop: OnNodeDrag<CanvasFlowNode>,
): SelectionDragHandlers => ({
  onSelectionDragStart: (event, group) => {
    if (group[0]) onStart(event.nativeEvent, group[0], group)
  },
  onSelectionDrag: (event, group) => {
    if (group[0]) onMove(event.nativeEvent, group[0], group)
  },
  onSelectionDragStop: (event, group) => {
    if (group[0]) onStop(event.nativeEvent, group[0], group)
  },
})
