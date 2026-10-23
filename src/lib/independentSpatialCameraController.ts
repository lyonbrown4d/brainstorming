import { resumeIndependentSpatialCameraSession } from '@renderer/lib/independentSpatialCameraHandoff'
import type { PerspectiveCamera } from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialCameraNeedsFocus } from '@renderer/lib/independentSpatialCameraFocus'
import { bindIndependentSpatialCameraInput } from '@renderer/lib/independentSpatialCameraInput'
import { bindIndependentSpatialCameraEnvironment } from '@renderer/lib/independentSpatialCameraEnvironment'
import {
  applySpatialCameraWheel,
  createSpatialControls,
  freezeSpatialControls,
  observeSpatialCameraBounds,
  spatialCameraSnapshot,
  truckSpatialCameraPixels,
} from '@renderer/lib/spatialCameraController'
import {
  runSpatialCameraCommand,
  setSpatialSceneDistanceLimits,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import {
  cameraPositionFor,
  cameraViewChanged,
  externalSpatialCameraFrame,
  type CameraWheelAction,
} from '@renderer/lib/spatialCameraNavigation'
import { useEditor } from '@renderer/state/editor'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { setSpatialLens } from '@renderer/state/spatialLens'
import { getSpatialView, type SpatialView } from '@renderer/state/spatialView'
import {
  canNavigateSpatialCamera,
  clearSpatialNavigationPreview,
  createSpatialCameraSession,
  publishSpatialNavigationFrame,
  readSpatialNavigationStart,
  restoreSpatialNavigationPreview,
  saveSpatialNavigationSession,
  type SpatialCameraSession,
} from '@renderer/state/spatialNavigation'

interface CameraControllerInput {
  readonly runtime: IndependentSpatialRuntime
  readonly camera: PerspectiveCamera
  readonly canvas: HTMLCanvasElement
  readonly reducedMotion: boolean
  readonly disabled: () => boolean
}

/** One perspective camera owns the 3D pose; updates never touch a 2D canvas. */
export const createIndependentSpatialCameraController = (input: CameraControllerInput) => {
  const { runtime, camera, canvas, reducedMotion } = input
  const bounds = observeSpatialCameraBounds(canvas)
  if (!bounds) return null
  const size = bounds.read
  const { workbook, activeSheetId: sheetId } = useEditor.getState()
  const workbookId = workbook.id
  const scene = (): SpatialCameraScene => ({
    layout: runtime.model.layout,
    depths: runtime.model.depths,
    drawings: runtime.model.document.drawings,
    selectedId: useEditor.getState().selectedId,
    rootId: runtime.model.document.rootId,
  })
  const controls = createSpatialControls(camera, canvas, reducedMotion)
  const start = readSpatialNavigationStart(
    workbookId,
    sheetId,
    bounds.initial,
    { x: 0, y: 0, zoom: 1 },
    scene(),
    controls,
  )
  const target = start.initial.target
  let currentView: SpatialView = { ...start.view, target }
  let currentDistance = start.initial.distance
  let lastViewport = start.initial.viewport
  let session: SpatialCameraSession | null = null
  let writing = false
  let disposed = false
  let preservePreview = true
  let wheelTimer = 0
  const wake = (): void => {
    if (!disposed) runtime.invalidate()
  }
  const apply = (view: SpatialView, distance: number, transition: boolean): void => {
    currentView = view
    currentDistance = distance
    void controls.setLookAt(...cameraPositionFor(view, distance), transition)
    wake()
  }
  const publish = (): void => {
    if (disposed) return
    const snapshot = spatialCameraSnapshot(controls, currentView, size())
    currentView = snapshot.view
    currentDistance = snapshot.distance
    lastViewport = snapshot.viewport
    camera.updateMatrixWorld()
    writing = true
    publishSpatialNavigationFrame(workbookId, sheetId, currentView, currentDistance, lastViewport)
    writing = false
    runtime.changed('camera')
  }
  const finish = (commit: boolean): void => {
    const ended = session
    if (!ended) return
    session = null
    runtime.navigating = false
    window.clearTimeout(wheelTimer)
    if (!commit || !canNavigateSpatialCamera(ended.workbookId, ended.sheetId, ended.document)) {
      apply(ended.original, ended.distance, false)
      controls.update(0)
      writing = true
      lastViewport = restoreSpatialNavigationPreview(
        ended.workbookId,
        ended.sheetId,
        ended.original,
        ended.distance,
        size(),
      )
      writing = false
      publish()
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
  const freeze = (): void => {
    const snapshot = freezeSpatialControls(controls, currentView, size())
    currentView = snapshot.view
    currentDistance = snapshot.distance
    controls.update(0)
    if (session) finish(true)
    preservePreview = true
    runtime.navigating = false
    publish()
  }
  const canNavigate = (): boolean =>
    !input.disabled() &&
    !runtime.interacting &&
    canNavigateSpatialCamera(workbookId, sheetId, useEditor.getState().history.document)
  const wheel = (action: CameraWheelAction): void => {
    if (session?.pointerId !== undefined && session.pointerId !== null && !session.ended) return
    session = resumeIndependentSpatialCameraSession(session, null) ?? session
    setSpatialSceneDistanceLimits(controls, scene())
    session ??= createSpatialCameraSession(workbookId, sheetId, currentView, currentDistance, null)
    runtime.navigating = true
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
  const detachInput = bindIndependentSpatialCameraInput({
    canvas,
    controls,
    size,
    canNavigate,
    pick: (x, y) => runtime.pick(x, y),
    start: (event) => {
      const continuing = resumeIndependentSpatialCameraSession(session, event.pointerId)
      if (!continuing && session) finish(session.ended || session.pointerId === null)
      setSpatialSceneDistanceLimits(controls, scene())
      session =
        continuing ??
        createSpatialCameraSession(
          workbookId,
          sheetId,
          currentView,
          currentDistance,
          event.pointerId,
        )
      runtime.navigating = true
    },
    end: () => {
      if (session?.pointerId === undefined || session.pointerId === null) return
      session.ended = true
      wake()
    },
    cancel: () => {
      if (!session) return false
      finish(false)
      return true
    },
    wheel,
    truck: (x, y) => {
      truckSpatialCameraPixels(controls, currentDistance, size().height, x, y)
      wake()
    },
  })
  const stopEnvironment = bindIndependentSpatialCameraEnvironment({
    runtime,
    workbookId,
    sheetId,
    initialSettings: start.persistedSpatial,
    session: () => session,
    finish,
    canNavigate,
    wheel,
    externalView,
    runCommand: (command) => {
      if (input.disabled()) return false
      if (typeof command === 'object') {
        const rect = runtime.rectangle(command.topicId)
        if (!independentSpatialCameraNeedsFocus(rect ?? undefined, canvas.getBoundingClientRect()))
          return true
      }
      setSpatialSceneDistanceLimits(controls, scene())
      const accepted = runSpatialCameraCommand(controls, command, scene(), size(), !reducedMotion)
      if (accepted) {
        preservePreview = true
        wake()
      }
      return accepted
    },
    settingsChanged: () => {
      preservePreview = false
      if (!session) clearSpatialNavigationPreview(workbookId, sheetId, target)
    },
    sceneChanged: () => {
      setSpatialSceneDistanceLimits(controls, scene())
      wake()
    },
  })
  setSpatialSceneDistanceLimits(controls, scene())
  controls.enabled = canNavigate()
  apply(currentView, currentDistance, false)
  controls.update(0)
  publish()
  controls.addEventListener('wake', wake)
  runtime.freezeCamera = freeze
  const observer = new ResizeObserver(() => {
    setSpatialSceneDistanceLimits(controls, scene())
    const bounded = Math.min(controls.maxDistance, Math.max(controls.minDistance, currentDistance))
    if (bounded !== currentDistance) {
      apply(currentView, bounded, false)
      controls.update(0)
    }
    publish()
  })
  observer.observe(canvas)
  return {
    update: (delta: number): void => {
      if (disposed) return
      if (controls.update(Math.min(0.05, delta))) {
        publish()
        wake()
      } else if (session?.ended) finish(true)
      else if (!session && !preservePreview) {
        writing = true
        clearSpatialNavigationPreview(workbookId, sheetId, target)
        writing = false
        preservePreview = true
      }
    },
    dispose: (): void => {
      finish(false)
      saveSpatialNavigationSession(workbookId, sheetId, {
        target: currentView.target ?? target,
        distance: currentDistance,
        viewport: lastViewport,
      })
      disposed = true
      runtime.navigating = false
      window.clearTimeout(wheelTimer)
      observer.disconnect()
      stopEnvironment()
      bounds.dispose()
      detachInput()
      controls.removeEventListener('wake', wake)
      controls.dispose()
      if (runtime.freezeCamera === freeze) runtime.freezeCamera = () => undefined
      setSpatialLens(workbookId, sheetId, undefined)
    },
  }
}
