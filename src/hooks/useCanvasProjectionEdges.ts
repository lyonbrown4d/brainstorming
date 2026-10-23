import { useLayoutEffect, useRef } from 'react'
import { useStoreApi } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { canvasProjectionEdges } from '@renderer/lib/canvasProjectionEdges'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

/** Publish through RF's official edge setter without a camera-driven controlled-prop round trip. */
export const useCanvasProjectionEdges = (controller: CanvasProjectionController): void => {
  const store = useStoreApi()
  const selected = useAnnotationInteraction((state) => state.selected)
  const playing = usePresentation((state) => state.playing)
  const sheetId = useEditor((state) => state.activeSheetId)
  const readSource = () => ({
    edges: controller.getProjection().edges,
    selected: useAnnotationInteraction.getState().selected,
    playing: usePresentation.getState().playing,
    sheetId: useEditor.getState().activeSheetId,
  })
  const previous = useRef<ReturnType<typeof readSource> | null>(null)
  const publish = useMemoizedFn(() => {
    const source = readSource()
    const before = previous.current
    if (
      before?.edges === source.edges &&
      before.selected === source.selected &&
      before.playing === source.playing &&
      before.sheetId === source.sheetId
    )
      return
    previous.current = source
    store
      .getState()
      .setEdges(
        canvasProjectionEdges(source.edges, source.sheetId, source.selected, source.playing),
      )
  })
  useLayoutEffect(
    () => () => {
      previous.current = null
    },
    [store],
  )
  useLayoutEffect(() => {
    publish()
    return controller.subscribe(publish)
  }, [controller, store, publish])
  useLayoutEffect(() => {
    publish()
  }, [selected, playing, sheetId, publish])
}
