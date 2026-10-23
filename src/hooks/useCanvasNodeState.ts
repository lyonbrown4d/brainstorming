import { useLayoutEffect, useRef, type SetStateAction } from 'react'
import { applyNodeChanges, useStoreApi, type NodeChange } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { useEditor } from '@renderer/state/editor'
import { useSelection, useSelectedDrawingIds } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'

/** React Flow owns live 2D nodes; native geometry and pointer previews share one reconciler. */
export const useCanvasNodeState = (
  projected: CanvasFlowNode[] | CanvasProjectionController,
  scope: string,
  dragging: ReadonlySet<string> | undefined,
) => {
  const store = useStoreApi<CanvasFlowNode>()
  const sheetId = useEditor((state) => state.activeSheetId)
  const primary = useEditor((state) => state.selectedId)
  const topics = useSelection((state) => state.sheets[sheetId])
  const drawings = useSelectedDrawingIds()
  const playing = usePresentation((state) => state.playing)
  const readSource = () => {
    const editor = useEditor.getState()
    const selection = useSelection.getState()
    return {
      projected: Array.isArray(projected) ? projected : projected.getProjection().nodes,
      scope,
      topics: selection.sheets[editor.activeSheetId],
      drawings: selection.drawings[editor.activeSheetId],
      primary: editor.selectedId,
      playing: usePresentation.getState().playing,
    }
  }
  const previousSource = useRef<ReturnType<typeof readSource> | null>(null)
  const reconcile = useMemoizedFn(() => {
    const source = readSource()
    const before = previousSource.current
    // RF's temporary marquee selection must survive until onSelectionEnd commits it.
    if (
      before?.projected === source.projected &&
      before.scope === scope &&
      before.topics === source.topics &&
      before.drawings === source.drawings &&
      before.primary === source.primary &&
      before.playing === source.playing
    )
      return
    const state = store.getState()
    const next = synchronizeCanvasNodes(
      before?.scope === scope ? state.nodes : source.projected,
      source.projected,
      {
        geometryChanged: before?.projected !== source.projected || before.scope !== scope,
        dragging: before?.scope === scope ? dragging : undefined,
        topics: new Set(source.topics ?? [source.primary]),
        drawings: new Set(source.drawings),
        playing: source.playing,
      },
    )
    previousSource.current = source
    if (next !== state.nodes) state.setNodes(next)
  })
  useLayoutEffect(
    () => () => {
      // React Flow resets its store during StrictMode's mount replay.
      previousSource.current = null
    },
    [store],
  )
  useLayoutEffect(() => {
    reconcile()
    return Array.isArray(projected) ? undefined : projected.subscribe(reconcile)
  }, [projected, store, reconcile])
  useLayoutEffect(() => {
    reconcile()
  }, [scope, topics, drawings, primary, playing, dragging, reconcile])
  // Stable callbacks preserve the drag cancellation subscriptions while the camera moves.
  const getNodes = useMemoizedFn(() => store.getState().nodes)
  const setNodes = useMemoizedFn((update: SetStateAction<CanvasFlowNode[]>) => {
    const state = store.getState()
    const next = typeof update === 'function' ? update(state.nodes) : update
    // Publish each complete pointer preview atomically, without a controlled-prop round trip.
    if (next !== state.nodes) state.setNodes(next)
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
  return { getNodes, setNodes, onNodesChange }
}
