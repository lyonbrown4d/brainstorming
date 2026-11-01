import { useLayoutEffect, useMemo, useRef, type SetStateAction } from 'react'
import { useReducedMotion } from 'motion/react'
import { applyNodeChanges, useStoreApi, type NodeChange } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { synchronizeCanvasNodes } from '@renderer/lib/canvasDragNodes'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'
import { createCanvasNodeMotion } from '@renderer/lib/canvasNodeMotion'

/** React Flow owns live 2D nodes; native geometry and pointer previews share one reconciler. */
export const useCanvasNodeState = (
  projected: CanvasFlowNode[] | CanvasProjectionController,
  scope: string,
  dragging: ReadonlySet<string> | undefined,
) => {
  const store = useStoreApi<CanvasFlowNode>()
  const reduced = useReducedMotion()
  const motion = useMemo(
    () =>
      createCanvasNodeMotion(
        () => store.getState().nodes,
        (nodes) => {
          store.getState().setNodes(nodes)
        },
      ),
    [store],
  )
  useLayoutEffect(() => {
    const finish = () => {
      motion.finish()
    }
    // A new direct interaction always takes precedence over a settling operation.
    for (const name of ['pointerdown', 'keydown', 'wheel'] as const)
      window.addEventListener(name, finish, true)
    return () => {
      for (const name of ['pointerdown', 'keydown', 'wheel'] as const)
        window.removeEventListener(name, finish, true)
      finish()
    }
  }, [motion])
  useLayoutEffect(() => {
    if (reduced) motion.finish()
  }, [reduced, motion])
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
      editing: editor.editingId,
    }
  }
  const previousSource = useRef<ReturnType<typeof readSource> | null>(null)
  const reconcile = useMemoizedFn(() => {
    const source = readSource()
    const before = previousSource.current
    if (source.playing && !before?.playing) motion.finish()
    // RF's temporary marquee selection must survive until onSelectionEnd commits it.
    if (
      before?.projected === source.projected &&
      before.scope === scope &&
      before.topics === source.topics &&
      before.drawings === source.drawings &&
      (source.topics !== undefined || before.primary === source.primary) &&
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
    if (next !== state.nodes) {
      if (before?.projected !== source.projected || before.scope !== scope) {
        const editingExisting =
          source.editing && before?.projected.some((node) => node.id === source.editing)
        motion.publish(
          next,
          before?.scope === scope &&
            before.projected.length > 0 &&
            source.projected.length > 0 &&
            !reduced &&
            !dragging?.size &&
            !source.playing &&
            !editingExisting,
        )
      } else state.setNodes(next)
    }
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
    // Selection belongs to RF's live nodes; publishing it must not rerender Canvas2D.
    const subscriptions = [
      useEditor.subscribe(reconcile),
      useSelection.subscribe(reconcile),
      usePresentation.subscribe(reconcile),
    ]
    reconcile()
    return () => {
      for (const unsubscribe of subscriptions) unsubscribe()
    }
  }, [store, reconcile])
  useLayoutEffect(() => {
    reconcile()
  }, [scope, dragging, reconcile])
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
