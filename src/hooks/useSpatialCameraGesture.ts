import { useEffect, useRef } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import {
  cameraElementSize,
  cameraPositionFor,
  cameraViewChanged,
  cameraViewportChanged,
  externalSpatialCameraFrame,
  type CameraWheelAction,
} from '@renderer/lib/spatialCameraNavigation'
import {
  applySpatialCameraWheel,
  createSpatialControls,
  createSpatialPerspectiveCamera,
  publishSpatialCameraSnapshot,
  spatialCameraSnapshot,
} from '@renderer/lib/spatialCameraController'
import { bindSpatialCameraGestureInput } from '@renderer/lib/spatialCameraGestureInput'
import {
  setSpatialSceneDistanceLimits,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import { useEditor } from '@renderer/state/editor'
import { bindSpatialCameraEnvironment } from '@renderer/state/spatialCameraEnvironment'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { setSpatialLens } from '@renderer/state/spatialLens'
import { getSpatialView, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { setSpatialViewport } from '@renderer/state/spatialViewports'
import {
  canNavigateSpatialCamera,
  createSpatialCameraSession,
  readSpatialNavigationStart,
  restoreSpatialNavigationPreview,
  saveSpatialNavigationSession,
  type SpatialCameraSession,
} from '@renderer/state/spatialNavigation'

/** One CameraControls instance owns input, the temporary view, lens and RF viewport. */
export const useSpatialCameraGesture = (
  element: HTMLDivElement | null,
  root: HTMLElement | null,
  active: boolean,
  scene: SpatialCameraScene,
): void => {
  const flow = useReactFlow()
  const flowStore = useStoreApi()
  const reducedMotion = useReducedMotion()
  const activeRef = useRef(active)
  activeRef.current = active
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const controlsRef = useRef<ReturnType<typeof createSpatialControls> | null>(null)
  const sceneReady = Boolean(scene.layout && scene.depths)
  useEffect(() => {
    if (controlsRef.current) setSpatialSceneDistanceLimits(controlsRef.current, sceneRef.current)
  }, [scene.layout, scene.depths, scene.drawings])
  useEffect(() => {
    if (!element || !root || !sceneReady) return
    const size = (): { width: number; height: number } => cameraElementSize(root)
    const initialSize = size()
    if (initialSize.width <= 0 || initialSize.height <= 0) return
    const editor = useEditor.getState()
    const workbookId = editor.workbook.id
    const sheetId = editor.activeSheetId
    const camera = createSpatialPerspectiveCamera(initialSize)
    const controls = createSpatialControls(camera, element, Boolean(reducedMotion))
    const start = readSpatialNavigationStart(
      workbookId,
      sheetId,
      initialSize,
      flow.getViewport(),
      sceneRef.current,
      controls,
    )
    const { view: first, initial } = start
    const { distance, target } = initial
    controlsRef.current = controls
    setSpatialSceneDistanceLimits(controls, sceneRef.current)
    controls.enabled = activeRef.current
    let currentView: SpatialView = { ...first, target }
    let currentDistance = distance
    let session: SpatialCameraSession | null = null
    let frame = 0
    let previousFrame = 0
    let writing = false
    let lastViewport = initial.viewport
    void flow.setViewport(lastViewport)
    setSpatialViewport(workbookId, sheetId, '3d', lastViewport)
    let disposed = false
    let preservePreview = true
    let wheelTimer = 0
    const apply = (view: SpatialView, nextDistance: number, transition: boolean): void => {
      currentView = view
      currentDistance = nextDistance
      void controls.setLookAt(...cameraPositionFor(view, nextDistance), transition)
      wake()
    }
    const publish = (): void => {
      if (disposed) return
      writing = true
      const snapshot = publishSpatialCameraSnapshot(
        controls,
        currentView,
        size(),
        workbookId,
        sheetId,
        (viewport) => {
          void flow.setViewport(viewport)
        },
      )
      currentDistance = snapshot.distance
      currentView = snapshot.view
      lastViewport = snapshot.viewport
      writing = false
    }
    const tick = (time: number): void => {
      frame = 0
      if (disposed) return
      const delta = previousFrame ? Math.min(0.05, (time - previousFrame) / 1000) : 1 / 60
      previousFrame = time
      if (controls.update(delta)) {
        publish()
        wake()
      } else {
        previousFrame = 0
        if (session?.ended) finish(true)
        else if (!session && !preservePreview)
          useSpatialView.getState().clearView(workbookId, sheetId)
      }
    }
    const wake = (): void => {
      if (!frame && !disposed) frame = requestAnimationFrame(tick)
    }
    const finish = (commit: boolean): void => {
      const ended = session
      if (!ended) return
      session = null
      window.clearTimeout(wheelTimer)
      if (!commit || !canNavigateSpatialCamera(ended.workbookId, ended.sheetId, ended.document)) {
        apply(ended.original, ended.distance, false)
        writing = true
        const next = restoreSpatialNavigationPreview(
          ended.workbookId,
          ended.sheetId,
          ended.original,
          ended.distance,
          size(),
        )
        lastViewport = next
        void flow.setViewport(next)
        writing = false
        return
      }
      if (
        (ended.pointerId !== null || ended.wheelCommit) &&
        cameraViewChanged(ended.original, currentView)
      ) {
        preservePreview = false
        saveSpatialView({
          yaw: currentView.yaw,
          pitch: currentView.pitch,
          ...(currentView.target ? { target: currentView.target } : {}),
        })
      } else if (ended.pointerId === null) preservePreview = true
    }
    const makeSession = (pointerId: number | null): SpatialCameraSession =>
      createSpatialCameraSession(workbookId, sheetId, currentView, currentDistance, pointerId)
    const pointerDown = (event: PointerEvent): void => {
      setSpatialSceneDistanceLimits(controls, sceneRef.current)
      if (session?.pointerId === null) finish(true)
      if (session) finish(false)
      session = makeSession(event.pointerId)
    }
    const pointerUp = (pointerId: number): void => {
      if (session?.pointerId !== pointerId) return
      currentView = spatialCameraSnapshot(controls, currentView, size(), true).view
      finish(true)
      wake()
    }
    const wheel = (action: CameraWheelAction): void => {
      if (session?.pointerId !== undefined && session.pointerId !== null) return
      setSpatialSceneDistanceLimits(controls, sceneRef.current)
      session ??= makeSession(null)
      session.ended = false
      session.wheelCommit ||= action.kind === 'rotate'
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        if (session?.pointerId === null) {
          session.ended = true
          wake()
        }
      }, 140)
      applySpatialCameraWheel(controls, action, currentDistance, size().height)
      wake()
    }
    const cancel = (pointerId?: number): boolean => {
      if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) return false
      finish(false)
      return true
    }
    const externalView = (): void => {
      if (writing || session || disposed) return
      const next = externalSpatialCameraFrame(
        currentView,
        currentDistance,
        target,
        getSpatialView(workbookId, sheetId),
      )
      if (next) apply(next.view, next.distance, !reducedMotion)
    }
    const externalViewport = (): void => {
      if (writing || disposed) return
      const next = flow.getViewport()
      if (!cameraViewportChanged(next, lastViewport)) return
      // React Flow is only an editing projection in 3D. Its startup or restore
      // transforms must never become camera pose commands.
      writing = true
      void flow.setViewport(lastViewport)
      writing = false
    }
    apply(currentView, currentDistance, false)
    useSpatialView.getState().setView(workbookId, sheetId, { target })
    setSpatialLens(workbookId, sheetId, currentDistance)
    controls.addEventListener('wake', wake)
    const detachInput = bindSpatialCameraGestureInput({
      element,
      root,
      controls,
      size,
      canNavigate: () =>
        activeRef.current &&
        canNavigateSpatialCamera(workbookId, sheetId, useEditor.getState().history.document),
      onStart: pointerDown,
      onEnd: pointerUp,
      onCancel: cancel,
      onWheel: wheel,
      distance: () => currentDistance,
      view: () => currentView,
      pendingMotion: () => Boolean(frame && !session),
      onFrozen: (snapshot) => {
        currentView = snapshot.view
        currentDistance = snapshot.distance
        preservePreview = true
        cancelAnimationFrame(frame)
        frame = 0
        previousFrame = 0
      },
      wake,
    })
    const stopEnvironment = bindSpatialCameraEnvironment({
      root,
      camera,
      controls,
      workbookId,
      sheetId,
      scene: () => sceneRef.current,
      size,
      distance: () => currentDistance,
      ready: () => !session,
      finishSession: () => {
        finish(true)
      },
      transition: !reducedMotion,
      onCommand: () => {
        preservePreview = true
        wake()
      },
      onView: externalView,
      onViewport: externalViewport,
      subscribeViewport: (callback) => flowStore.subscribe(callback),
      initialSettings: start.persistedSpatial,
      onSettingsChanged: () => {
        preservePreview = false
      },
      session: () => session,
      cancelSession: () => {
        finish(false)
      },
      applyDistance: (distance) => {
        apply(currentView, distance, false)
      },
      publish,
    })
    return () => {
      finish(false)
      saveSpatialNavigationSession(workbookId, sheetId, {
        target: currentView.target ?? target,
        distance: currentDistance,
        viewport: lastViewport,
      })
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      stopEnvironment()
      controls.removeEventListener('wake', wake)
      detachInput()
      controls.dispose()
      if (controlsRef.current === controls) controlsRef.current = null
      setSpatialLens(workbookId, sheetId, undefined)
    }
  }, [element, root, flow, flowStore, reducedMotion, sceneReady])
}
