import type { CameraControlsImpl } from '@react-three/drei'
import type { PerspectiveCamera } from 'three'
import type { SpatialSettings } from '@core'
import { observeSpatialCameraSize } from '@renderer/lib/spatialCameraController'
import {
  runSpatialCameraCommand,
  setSpatialSceneDistanceLimits,
  type SpatialCameraScene,
} from '@renderer/lib/spatialCameraCommands'
import type { CameraSize } from '@renderer/lib/spatialCameraNavigation'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useSpatialView } from '@renderer/state/spatialView'
import {
  canNavigateSpatialCamera,
  subscribeSpatialCameraCommands,
  type SpatialCameraSession,
} from '@renderer/state/spatialNavigation'

interface Environment {
  readonly root: HTMLElement
  readonly camera: PerspectiveCamera
  readonly controls: CameraControlsImpl
  readonly workbookId: string
  readonly sheetId: string
  readonly scene: () => SpatialCameraScene
  readonly size: () => CameraSize
  readonly distance: () => number
  readonly ready: () => boolean
  readonly finishSession: () => void
  readonly transition: boolean
  readonly onCommand: () => void
  readonly onView: () => void
  readonly onViewport: () => void
  readonly subscribeViewport: (callback: () => void) => () => void
  readonly initialSettings: SpatialSettings | undefined
  readonly onSettingsChanged: () => void
  readonly session: () => SpatialCameraSession | null
  readonly cancelSession: () => void
  readonly applyDistance: (distance: number) => void
  readonly publish: () => void
}

/** Observe document, viewport and resize changes without restarting the controller. */
export const bindSpatialCameraEnvironment = (input: Environment): (() => void) => {
  let persistedSettings = input.initialSettings
  const validate = (): void => {
    const session = input.session()
    if (session && !canNavigateSpatialCamera(session.workbookId, session.sheetId, session.document))
      input.cancelSession()
  }
  const unsubscribe = [
    subscribeSpatialCameraCommands(
      input.workbookId,
      input.sheetId,
      () => {
        if (input.session()?.pointerId === null) input.finishSession()
        return input.ready()
      },
      (command) => {
        setSpatialSceneDistanceLimits(input.controls, input.scene())
        const accepted = runSpatialCameraCommand(
          input.controls,
          command,
          input.scene(),
          input.size(),
          input.transition,
        )
        if (accepted) input.onCommand()
        return accepted
      },
    ),
    useSpatialView.subscribe(input.onView),
    useEditor.subscribe((state) => {
      validate()
      const next = state.history.document.settings?.spatial
      if (next !== persistedSettings) {
        persistedSettings = next
        input.onSettingsChanged()
        if (!input.session()) useSpatialView.getState().clearView(input.workbookId, input.sheetId)
      }
      input.onView()
    }),
    useCanvasInk.subscribe(validate),
    useCanvasInteraction.subscribe(validate),
    usePresentation.subscribe(validate),
    input.subscribeViewport(input.onViewport),
  ]
  const stopResize = observeSpatialCameraSize(
    input.root,
    input.camera,
    input.controls,
    input.scene,
    input.distance,
    input.applyDistance,
    input.publish,
  )
  return () => {
    stopResize()
    for (const stop of unsubscribe) stop()
  }
}
