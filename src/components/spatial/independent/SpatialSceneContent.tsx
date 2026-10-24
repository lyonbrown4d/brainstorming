import { useEffect, useRef } from 'react'
import { isEqual } from 'lodash-es'
import { Group } from 'three'
import { addAfterEffect, useThree } from '@react-three/fiber'
import { createThreeTopicQuality } from '@renderer/lib/threeTopicQuality'
import { createThreeSceneModelCache } from '@renderer/lib/threeSceneModelCache'
import type {
  IndependentSpatialRuntime,
  SpatialSceneModel,
} from '@renderer/lib/independentSpatialRuntime'
import { prepareThreeTopicAtlas, createThreeTopicRasterCache } from '@renderer/lib/threeTopicAtlas'
import { createThreeTopicBatches } from '@renderer/lib/threeTopicBatch'
import { createThreeSceneLineBatch } from '@renderer/lib/threeSceneLineBatch'
import { createThreeSceneAnnotationBatch } from '@renderer/lib/threeSceneAnnotationBatch'
import { createThreeSceneInk } from '@renderer/lib/threeSceneInk'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, selectedDrawingIds, useSelection } from '@renderer/state/selection'

export interface SpatialSceneContentProps {
  readonly runtime: IndependentSpatialRuntime
  readonly onPreparing?: () => void
  readonly onReady?: () => void
  readonly onError?: (error: unknown) => void
}

/** The whole document is GPU data; React never mounts a component for each topic. */
export const SpatialSceneContent = ({
  runtime,
  onPreparing,
  onReady,
  onError,
}: SpatialSceneContentProps) => {
  const group = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const renderer = useThree((state) => state.gl)
  const callbacks = useRef({ onPreparing, onReady, onError })
  useEffect(() => {
    callbacks.current = { onPreparing, onReady, onError }
  }, [onPreparing, onReady, onError])
  useEffect(() => {
    const host = group.current
    if (!host) return
    const cache = createThreeTopicRasterCache()
    let controller = new AbortController()
    let dispose: (() => void) | undefined
    let update: (() => void) | undefined
    let updateSelection: (() => boolean) | undefined
    let quality: ReturnType<typeof createThreeTopicQuality> | null = null
    let disposed = false
    let transientGeometry = false
    let removeReadyEffect: (() => void) | undefined
    const scheduleReady = (signal: AbortSignal) => {
      removeReadyEffect?.()
      removeReadyEffect = addAfterEffect(() => {
        removeReadyEffect?.()
        removeReadyEffect = undefined
        if (!signal.aborted && !disposed) callbacks.current.onReady?.()
      })
      invalidate()
    }
    const prepare = async (model: SpatialSceneModel, complete: (success: boolean) => void) => {
      // Block hit testing against the incoming layout until its actual GPU frame is ready.
      // Equivalent camera-only models take reuse() and keep their current ready surface.
      callbacks.current.onPreparing?.()
      quality?.dispose()
      quality = null
      removeReadyEffect?.()
      controller.abort()
      controller = new AbortController()
      const signal = controller.signal
      let pendingDisposals: (() => void)[] = []
      try {
        const atlas = await prepareThreeTopicAtlas(model, cache, signal)
        if (!atlas) {
          complete(false)
          return
        }
        if (signal.aborted || disposed) {
          atlas.dispose()
          complete(false)
          return
        }
        pendingDisposals.push(atlas.dispose)
        const topics = createThreeTopicBatches(atlas, runtime)
        pendingDisposals.push(topics.dispose)
        const lines = createThreeSceneLineBatch(runtime)
        pendingDisposals.push(lines.dispose)
        const ink = createThreeSceneInk(runtime)
        pendingDisposals.push(ink.dispose)
        const annotations = createThreeSceneAnnotationBatch(runtime)
        pendingDisposals.push(annotations.dispose)
        const next = new Group()
        next.add(annotations.mesh, ...topics.meshes, lines.mesh, ...ink.meshes)
        const nextQuality = createThreeTopicQuality({
          runtime,
          overview: atlas,
          base: topics,
          host: next,
          renderer,
          selected: () => new Set(selectedTopicIds(useEditor.getState())),
        })
        pendingDisposals.push(nextQuality.dispose)
        let previousTopics: readonly string[] | null = null
        let previousDrawings: readonly string[] | null = null
        const updateSelected = (force = false) => {
          const state = useEditor.getState()
          const topicIds = selectedTopicIds(state)
          const drawingIds = selectedDrawingIds(state)
          const topicsChanged = !isEqual(previousTopics, topicIds)
          const drawingsChanged = !isEqual(previousDrawings, drawingIds)
          if (!force && !topicsChanged && !drawingsChanged) return false
          previousTopics = topicIds
          previousDrawings = drawingIds
          if (force || topicsChanged) topics.updateSelection(new Set(topicIds))
          if (force || drawingsChanged) ink.update(new Set(drawingIds))
          invalidate()
          return true
        }
        const updateScene = () => {
          topics.updateGeometry()
          updateSelected(true)
          lines.update()
          annotations.update()
          transientGeometry = runtime.scales.size > 0 || runtime.relationPreviews.size > 0
        }
        updateScene()
        dispose?.()
        host.clear()
        host.add(next)
        const resources = pendingDisposals
        dispose = () => {
          resources
            .slice()
            .reverse()
            .forEach((release) => {
              release()
            })
        }
        pendingDisposals = []
        update = updateScene
        updateSelection = updateSelected
        quality = nextQuality
        quality.request()
        complete(true)
        scheduleReady(signal)
      } catch (error) {
        complete(false)
        pendingDisposals
          .slice()
          .reverse()
          .forEach((release) => {
            release()
          })
        if (!signal.aborted && !disposed) callbacks.current.onError?.(error)
      }
    }
    const models = createThreeSceneModelCache({
      prepare: (model, complete) => {
        void prepare(model, complete)
      },
      reuse: () => {
        controller.abort()
        controller = new AbortController()
        if (transientGeometry) update?.()
        quality?.request()
        scheduleReady(controller.signal)
      },
    })
    const unsubscribe = runtime.subscribe((kind) => {
      if (kind === 'model') models.update(runtime.model)
      else if (kind === 'camera') quality?.request()
      else {
        quality?.invalidate()
        update?.()
      }
    })
    const unsubscribeSelection = useSelection.subscribe(() => {
      if (updateSelection?.()) quality?.updateSelection()
    })
    const unsubscribeEditor = useEditor.subscribe((state, previous) => {
      if (
        state.selectedId !== previous.selectedId ||
        state.activeSheetId !== previous.activeSheetId
      ) {
        if (updateSelection?.()) quality?.updateSelection()
      }
    })
    models.update(runtime.model)
    return () => {
      disposed = true
      removeReadyEffect?.()
      controller.abort()
      models.clear()
      unsubscribe()
      unsubscribeSelection()
      unsubscribeEditor()
      dispose?.()
      host.clear()
      cache.clear()
    }
  }, [runtime, invalidate, renderer])
  return <group ref={group} />
}
