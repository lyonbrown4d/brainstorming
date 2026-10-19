import { create } from 'zustand'
import type { MindMapDocument } from '@core'
import { useEditor } from '@renderer/state/editor'

export type ViewportAction = 'zoomIn' | 'zoomOut' | 'actualSize' | 'centerRoot'
export const useViewportRequest = create<{ action: ViewportAction | null; sequence: number }>(
  () => ({
    action: null,
    sequence: 0,
  }),
)

/** View operations never enter document history. */
export const requestViewport = (action: ViewportAction): void => {
  useViewportRequest.setState((state) => ({ action, sequence: state.sequence + 1 }))
}

export interface TopicFocusRequest {
  readonly workbookId: string
  readonly sheetId: string
  readonly document: MindMapDocument
  readonly topicId: string
  readonly sequence: number
}
export const useTopicFocusRequest = create<{
  request: TopicFocusRequest | null
  sequence: number
}>(() => ({ request: null, sequence: 0 }))

/** Identity scopes the request to the target projection, even across identical topic IDs. */
export const requestTopicFocus = (topicId: string): void => {
  const editor = useEditor.getState()
  if (!editor.history.document.topics[topicId]) return
  useTopicFocusRequest.setState((state) => ({
    sequence: state.sequence + 1,
    request: {
      workbookId: editor.workbook.id,
      sheetId: editor.activeSheetId,
      document: editor.history.document,
      topicId,
      sequence: state.sequence + 1,
    },
  }))
}
export const clearTopicFocus = (sequence: number): void => {
  useTopicFocusRequest.setState((state) =>
    state.request?.sequence === sequence ? { request: null } : state,
  )
}
