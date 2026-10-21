import { useState, type SetStateAction } from 'react'
import { applyNodeChanges, type NodeChange } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { useEditor } from '@renderer/state/editor'
import { useSelection, useSelectedDrawingIds } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'

/** Derive camera frames directly; retain state only for RF measurements and pointer previews. */
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
  const source = { projected, scope, topics, drawings, primary, playing }
  const [retained, setRetained] = useState<{
    source: typeof source | null
    nodes: CanvasFlowNode[]
  }>(() => ({ source: null, nodes: projected }))
  const reconcile = (previous: typeof retained) => {
    const before = previous.source
    // RF's temporary marquee selection must survive until onSelectionEnd commits it.
    if (
      before?.projected === projected &&
      before.scope === scope &&
      before.topics === topics &&
      before.drawings === drawings &&
      before.primary === primary &&
      before.playing === playing
    )
      return previous.nodes
    return synchronizeCanvasNodes(
      previous.source?.scope === scope ? previous.nodes : projected,
      projected,
      {
        geometryChanged:
          previous.source?.projected !== projected || previous.source.scope !== scope,
        dragging: previous.source?.scope === scope ? dragging : undefined,
        topics: new Set(topics ?? [primary]),
        drawings: new Set(drawings),
        playing,
      },
    )
  }
  const nodes = reconcile(retained)
  // Stable callbacks preserve the drag cancellation subscriptions while the camera moves.
  const setNodes = useMemoizedFn((update: SetStateAction<CanvasFlowNode[]>) => {
    setRetained((previous) => {
      const current = reconcile(previous)
      return { source, nodes: typeof update === 'function' ? update(current) : update }
    })
  })
  const onNodesChange = useMemoizedFn((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
  })
  return { nodes, setNodes, onNodesChange }
}
