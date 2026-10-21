import { create } from 'zustand'
import { useEditor } from '@renderer/state/editor'

export type SpatialCameraCommand =
  | 'zoomIn'
  | 'zoomOut'
  | 'actualSize'
  | 'fit'
  | 'focusSelected'
  | 'centerRoot'
  | { readonly kind: 'focusTopic'; readonly topicId: string }

interface SpatialCameraRequest {
  readonly sequence: number
  readonly workbookId: string
  readonly sheetId: string
  readonly document: object
  readonly command: SpatialCameraCommand
}

export const useSpatialCameraRequest = create<{
  sequence: number
  request: SpatialCameraRequest | null
}>(() => ({ sequence: 0, request: null }))

/** Route shared viewport actions to the native perspective camera in 3D. */
export const requestSpatialCamera = (command: SpatialCameraCommand): void => {
  const editor = useEditor.getState()
  useSpatialCameraRequest.setState((state) => ({
    sequence: state.sequence + 1,
    request: {
      sequence: state.sequence + 1,
      workbookId: editor.workbook.id,
      sheetId: editor.activeSheetId,
      document: editor.history.document,
      command,
    },
  }))
}
