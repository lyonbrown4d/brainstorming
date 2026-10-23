import { isEqual } from 'lodash-es'
import { bindIndependentSpatialMinimapCamera } from '@renderer/lib/independentSpatialMinimapCamera'
import type { CameraWheelAction } from '@renderer/lib/spatialCameraNavigation'
import type { SpatialSettings } from '@core'
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
import type { SpatialCameraCommand } from '@renderer/state/spatialCameraCommands'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { bindIndependentSpatialCameraRequests } from '@renderer/lib/independentSpatialCameraRequests'

interface CameraEnvironment {
  readonly runtime: IndependentSpatialRuntime
  readonly workbookId: string
  readonly sheetId: string
  readonly initialSettings: SpatialSettings | undefined
  readonly session: () => SpatialCameraSession | null
  readonly finish: (commit: boolean) => void
  readonly canNavigate: () => boolean
  readonly wheel: (action: CameraWheelAction) => void
  readonly runCommand: (command: SpatialCameraCommand) => boolean
  readonly externalView: () => void
  readonly settingsChanged: () => void
  readonly sceneChanged: () => void
}

/** Subscribe to shared editor commands and settings without subscribing to a 2D canvas. */
export const bindIndependentSpatialCameraEnvironment = (input: CameraEnvironment): (() => void) => {
  let persisted = input.initialSettings
  const validate = (): void => {
    const session = input.session()
    if (session && !canNavigateSpatialCamera(session.workbookId, session.sheetId, session.document))
      input.finish(false)
  }
  const stops = [
    bindIndependentSpatialMinimapCamera(input.runtime, input.canNavigate, input.wheel),
    subscribeSpatialCameraCommands(
      input.workbookId,
      input.sheetId,
      () => {
        if (input.session()?.pointerId === null || input.session()?.ended) input.finish(true)
        return !input.session()
      },
      input.runCommand,
    ),
    bindIndependentSpatialCameraRequests(input.runtime, input.workbookId, input.sheetId),
    useSpatialView.subscribe(input.externalView),
    useEditor.subscribe((state) => {
      validate()
      const next = state.history.document.settings?.spatial
      if (!isEqual(next, persisted)) {
        persisted = next
        input.settingsChanged()
      }
      input.externalView()
    }),
    useCanvasInk.subscribe(validate),
    useCanvasInteraction.subscribe(validate),
    usePresentation.subscribe(validate),
    input.runtime.subscribe((kind) => {
      if (kind === 'model') input.sceneChanged()
    }),
  ]
  return () => {
    for (const stop of stops) stop()
  }
}
