import { useCanvasInk } from '@renderer/state/canvasInk'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import {
  useSpatialCameraRequest,
  type SpatialCameraCommand,
} from '@renderer/state/spatialCameraCommands'
import {
  cameraViewport,
  initialSpatialCameraFrame,
  type CameraSize,
} from '@renderer/lib/spatialCameraNavigation'
import {
  spatialCameraDefaultFrame,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import { getSpatialViewport, setSpatialViewport } from '@renderer/state/spatialViewports'
import { setSpatialLens } from '@renderer/state/spatialLens'
import { DEFAULT_SPATIAL_VIEW, getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import type { SpatialView } from '@renderer/state/spatialView'
import type { Viewport } from '@xyflow/react'

export interface SpatialNavigationFrame {
  readonly target: NonNullable<SpatialView['target']>
  readonly distance: number
  readonly viewport: Viewport
}

const frames = new Map<string, { signature: string; frame: SpatialNavigationFrame }>()
const frameKey = (workbookId: string, sheetId: string): string =>
  JSON.stringify([workbookId, sheetId])
const signature = (view: SpatialView): string =>
  JSON.stringify([view.yaw, view.pitch, view.spacing, view.target])
const validFrame = (frame: SpatialNavigationFrame): boolean =>
  Number.isFinite(frame.distance) &&
  frame.distance > 0 &&
  Number.isFinite(frame.target.x) &&
  Number.isFinite(frame.target.y) &&
  Number.isFinite(frame.target.z) &&
  Number.isFinite(frame.viewport.x) &&
  Number.isFinite(frame.viewport.y) &&
  Number.isFinite(frame.viewport.zoom) &&
  frame.viewport.zoom > 0

/** Remember the 3D pose while its separate 2D viewport is active. */
export const rememberSpatialNavigationFrame = (
  workbookId: string,
  sheetId: string,
  settings: SpatialView,
  frame: SpatialNavigationFrame,
): void => {
  if (!validFrame(frame)) return
  const key = frameKey(workbookId, sheetId)
  frames.delete(key)
  frames.set(key, { signature: signature(settings), frame })
  while (frames.size > 16) frames.delete(frames.keys().next().value ?? key)
}

export const rememberCurrentSpatialNavigationFrame = (
  workbookId: string,
  sheetId: string,
  frame: SpatialNavigationFrame,
): void => {
  const settings = useEditor.getState().history.document.settings?.spatial ?? DEFAULT_SPATIAL_VIEW
  rememberSpatialNavigationFrame(workbookId, sheetId, settings, frame)
}

export const getSpatialNavigationFrame = (
  workbookId: string,
  sheetId: string,
  settings: SpatialView,
): SpatialNavigationFrame | undefined => {
  const remembered = frames.get(frameKey(workbookId, sheetId))
  const savedViewport = getSpatialViewport(workbookId, sheetId, '3d')
  const frame = remembered?.frame
  if (
    !frame ||
    !validFrame(frame) ||
    remembered.signature !== signature(settings) ||
    !savedViewport
  )
    return undefined
  return Math.abs(savedViewport.x - frame.viewport.x) < 0.01 &&
    Math.abs(savedViewport.y - frame.viewport.y) < 0.01 &&
    Math.abs(savedViewport.zoom - frame.viewport.zoom) < 1e-5
    ? frame
    : undefined
}

/** Start from the saved 3D pose only when it belongs to the viewport being restored. */
export const readSpatialNavigationStart = (
  workbookId: string,
  sheetId: string,
  size: CameraSize,
  viewport: Viewport,
  scene: SpatialCameraScene,
) => {
  const persistedSpatial = useEditor.getState().history.document.settings?.spatial
  const view = getSpatialView(workbookId, sheetId)
  const remembered = getSpatialNavigationFrame(
    workbookId,
    sheetId,
    persistedSpatial ?? DEFAULT_SPATIAL_VIEW,
  )
  return {
    persistedSpatial,
    view,
    remembered,
    initial: initialSpatialCameraFrame(
      view,
      size,
      viewport,
      remembered ?? spatialCameraDefaultFrame(scene, view, size),
    ),
  }
}

export const publishSpatialNavigationFrame = (
  workbookId: string,
  sheetId: string,
  view: SpatialView,
  distance: number,
  viewport: Viewport,
): void => {
  useSpatialView.getState().setView(workbookId, sheetId, view)
  setSpatialLens(workbookId, sheetId, distance)
  rememberCurrentSpatialNavigationFrame(workbookId, sheetId, {
    target: view.target ?? { x: 0, y: 0, z: 0 },
    distance,
    viewport,
  })
}

export const restoreSpatialNavigationPreview = (
  workbookId: string,
  sheetId: string,
  view: SpatialView,
  distance: number,
  size: CameraSize,
): Viewport => {
  useSpatialView.getState().setView(workbookId, sheetId, view)
  setSpatialLens(workbookId, sheetId, distance)
  return cameraViewport(size, view.target ?? { x: 0, y: 0, z: 0 }, distance)
}

export const saveSpatialNavigationSession = (
  workbookId: string,
  sheetId: string,
  frame: SpatialNavigationFrame,
): void => {
  rememberCurrentSpatialNavigationFrame(workbookId, sheetId, frame)
  setSpatialViewport(workbookId, sheetId, '3d', frame.viewport)
}

export interface SpatialCameraSession {
  readonly workbookId: string
  readonly sheetId: string
  readonly document: object
  readonly original: SpatialView
  readonly distance: number
  readonly pointerId: number | null
  ended: boolean
  wheelCommit: boolean
}

export const createSpatialCameraSession = (
  workbookId: string,
  sheetId: string,
  original: SpatialView,
  distance: number,
  pointerId: number | null,
): SpatialCameraSession => ({
  workbookId,
  sheetId,
  document: useEditor.getState().history.document,
  original,
  distance,
  pointerId,
  ended: false,
  wheelCommit: false,
})

/** Guard native camera input while a document or canvas gesture owns the pointer. */
export const canNavigateSpatialCamera = (
  workbookId: string,
  sheetId: string,
  document: object,
): boolean => {
  const editor = useEditor.getState()
  return (
    editor.workbook.id === workbookId &&
    editor.activeSheetId === sheetId &&
    editor.history.document === document &&
    !editor.busy &&
    !editor.editingId &&
    !usePresentation.getState().playing &&
    useCanvasInk.getState().mode === 'select' &&
    !useCanvasInteraction.getState().drag &&
    getSpatialView(workbookId, sheetId).mode === '3d'
  )
}

/** Programmatic focus may run while a newly created topic is being edited. */
const canRunSpatialCameraCommand = (
  workbookId: string,
  sheetId: string,
  document: object,
): boolean => {
  const editor = useEditor.getState()
  return (
    editor.workbook.id === workbookId &&
    editor.activeSheetId === sheetId &&
    editor.history.document === document &&
    !usePresentation.getState().playing &&
    getSpatialView(workbookId, sheetId).mode === '3d'
  )
}

export const subscribeSpatialCameraCommands = (
  workbookId: string,
  sheetId: string,
  ready: () => boolean,
  run: (command: SpatialCameraCommand) => boolean,
): (() => void) => {
  let frame = 0
  const dispatch = (
    request: NonNullable<ReturnType<typeof useSpatialCameraRequest.getState>['request']>,
  ): void => {
    if (
      useSpatialCameraRequest.getState().request !== request ||
      request.workbookId !== workbookId ||
      request.sheetId !== sheetId
    )
      return
    if (!canRunSpatialCameraCommand(workbookId, sheetId, request.document)) return
    if (!ready()) {
      if (typeof request.command === 'object')
        frame = requestAnimationFrame(() => {
          dispatch(request)
        })
      return
    }
    if (run(request.command)) return
    if (typeof request.command === 'object')
      frame = requestAnimationFrame(() => {
        dispatch(request)
      })
  }
  const unsubscribe = useSpatialCameraRequest.subscribe(({ request }) => {
    if (frame) cancelAnimationFrame(frame)
    if (request) dispatch(request)
  })
  return () => {
    if (frame) cancelAnimationFrame(frame)
    unsubscribe()
  }
}
