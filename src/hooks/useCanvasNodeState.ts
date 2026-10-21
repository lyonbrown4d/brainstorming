import { useState } from 'react'
import { useNodesState } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { useEditor } from '@renderer/state/editor'
import { useSelection, useSelectedDrawingIds } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'

/** Reconcile controlled nodes before painting, rather than replaying each camera frame in an effect. */
export const useCanvasNodeState = (
  projected: CanvasFlowNode[],
  scope: string,
  dragging: ReadonlySet<string> | undefined,
) => {
  const sheetId = useEditor((state) => state.activeSheetId)
  const primary = useEditor((state) => state.selectedId)
  const topics = useSelection((state) => state.sheets[sheetId])
  const drawings = useSelectedDrawingIds()
  const playing = usePresentation((state) => state.playing)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(projected)
  const incoming = { projected, scope, topics, drawings, primary, playing }
  const [source, setSource] = useState<typeof incoming | null>(null)
  let current = nodes
  if (
    source?.projected !== projected ||
    source.scope !== scope ||
    source.topics !== topics ||
    source.drawings !== drawings ||
    source.primary !== primary ||
    source.playing !== playing
  ) {
    current = synchronizeCanvasNodes(source?.scope === scope ? nodes : projected, projected, {
      geometryChanged: source?.projected !== projected || source.scope !== scope,
      dragging: source?.scope === scope ? dragging : undefined,
      topics: new Set(topics ?? [primary]),
      drawings: new Set(drawings),
      playing,
    })
    setSource(incoming)
    setNodes(current)
  }
  return { nodes: current, setNodes, onNodesChange }
}
