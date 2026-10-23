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
      return previous
    return {
      source,
      nodes: synchronizeCanvasNodes(
        before?.scope === scope ? previous.nodes : projected,
        projected,
        {
          geometryChanged: before?.projected !== projected || before.scope !== scope,
          dragging: before?.scope === scope ? dragging : undefined,
          topics: new Set(topics ?? [primary]),
          drawings: new Set(drawings),
          playing,
        },
      ),
    }
  }
  const current = reconcile(retained)
  // Advance the baseline for external changes as well as RF updates. React retries this
  // component before children render; unrelated renders can then reuse the settled nodes.
  if (current !== retained) setRetained(current)
  // Stable callbacks preserve the drag cancellation subscriptions while the camera moves.
  const setNodes = useMemoizedFn((update: SetStateAction<CanvasFlowNode[]>) => {
    setRetained((previous) => {
      const current = reconcile(previous).nodes
      return { source, nodes: typeof update === 'function' ? update(current) : update }
    })
  })
  const onNodesChange = useMemoizedFn(
    (
      changes: NodeChange<CanvasFlowNode>[],
      preview?: (nodes: CanvasFlowNode[]) => CanvasFlowNode[],
    ) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)
        return preview ? preview(next) : next
      })
    },
  )
  return { nodes: current.nodes, setNodes, onNodesChange }
}
