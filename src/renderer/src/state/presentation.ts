import { create } from 'zustand'
import { getParentId, type MindMapDocument, type PresentationStep } from '@core'
import { useEditor } from './editor'
import { useSpatialView } from './spatial'

export const usePresentation = create<{
  sheetId: string | null
  workbookId: string | null
  index: number
  playing: boolean
  cameraRequest: {
    id: string
    sheetId: string
    camera: NonNullable<PresentationStep['camera']>
  } | null
}>(() => ({ sheetId: null, workbookId: null, index: 0, playing: false, cameraRequest: null }))
export function showPresentationStep(index: number): void {
  const editor = useEditor.getState()
  editor.commitDraft()
  if (useEditor.getState().editingId) return
  const step = editor.history.document.presentation?.[index]
  if (!step || !editor.history.document.topics[step.topicId]) return
  usePresentation.setState({
    playing: true,
    sheetId: editor.activeSheetId,
    workbookId: editor.workbook.id,
    index,
    cameraRequest: step.camera
      ? { id: crypto.randomUUID(), sheetId: editor.activeSheetId, camera: step.camera }
      : null,
  })
  editor.select(step.topicId)
  if (step.camera) useSpatialView.getState().setMode(editor.activeSheetId, '3d')
  useSpatialView
    .getState()
    .setFocus(
      editor.activeSheetId,
      step.camera || step.topicId === editor.history.document.rootId ? null : step.topicId,
    )
}
export function stopPresentation(): void {
  usePresentation.setState({ playing: false, cameraRequest: null })
}
export function presentationDocument(
  document: MindMapDocument,
  topicId: string | undefined,
): MindMapDocument {
  if (!topicId || !document.topics[topicId]) return document
  let parent = getParentId(document, topicId)
  let topics = document.topics
  while (parent) {
    const topic = topics[parent]
    if (topic?.collapsed) topics = { ...topics, [parent]: { ...topic, collapsed: false } }
    parent = getParentId(document, parent)
  }
  return topics === document.topics ? document : { ...document, topics }
}
