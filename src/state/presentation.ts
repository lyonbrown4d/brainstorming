import { create } from 'zustand'
import {
  getParentId,
  getVisibleTopicIds,
  type HistoryState,
  type MindMapDocument,
  type PresentationStep,
} from '@core'
import { useEditor } from '@renderer/state/editor'
import type { SheetView } from '@renderer/state/editorTypes'
import { useSelection } from '@renderer/state/selection'
import { useSpatialView, type SpatialSheetView } from '@renderer/state/spatial'
import { useWorkspace } from '@renderer/state/workspace'

interface PresentationSnapshot {
  history: HistoryState
  selectedId: string
  selection: readonly string[] | undefined
  view: SheetView | undefined
  spatial: SpatialSheetView | undefined
}
interface PresentationState {
  sheetId: string | null
  workbookId: string | null
  index: number
  playing: boolean
  steps: readonly PresentationStep[]
  generated: boolean
  snapshot: PresentationSnapshot | null
  cameraRequest: {
    id: string
    sheetId: string
    camera: NonNullable<PresentationStep['camera']>
  } | null
  viewportRequest: { id: string; sheetId: string; view: SheetView } | null
}
export const usePresentation = create<PresentationState>(() => ({
  sheetId: null,
  workbookId: null,
  index: 0,
  playing: false,
  steps: [],
  generated: false,
  snapshot: null,
  cameraRequest: null,
  viewportRequest: null,
}))
let unsubscribe: (() => void) | undefined

/** Automatic routes are session state; only explicit step-builder commands save a route. */
export const presentationSteps = (document: MindMapDocument): readonly PresentationStep[] => {
  return document.presentation?.length
    ? document.presentation
    : getVisibleTopicIds(document).map((topicId) => ({ topicId }))
}

export const capturePresentationViewport = (view: SheetView): void => {
  const state = usePresentation.getState()
  if (state.playing && state.snapshot && !state.snapshot.view)
    usePresentation.setState({ snapshot: { ...state.snapshot, view } })
}

export const showPresentationStep = (index: number): void => {
  let state = usePresentation.getState()
  if (!state.playing) {
    useEditor.getState().commitDraft()
    const editor = useEditor.getState()
    if (editor.editingId || editor.busy) return
    const steps = presentationSteps(editor.history.document)
    if (!steps[index]) return
    const sheetId = editor.activeSheetId
    usePresentation.setState({
      playing: true,
      sheetId,
      workbookId: editor.workbook.id,
      steps,
      generated: !editor.history.document.presentation?.length,
      snapshot: {
        history: editor.history,
        selectedId: editor.selectedId,
        selection: useSelection.getState().sheets[sheetId],
        view: editor.views[sheetId],
        spatial: useSpatialView.getState().sheets[sheetId],
      },
      viewportRequest: null,
    })
    const editorCleanup = useEditor.subscribe((next) => {
      const playing = usePresentation.getState()
      if (
        playing.playing &&
        (next.activeSheetId !== sheetId || next.history !== playing.snapshot?.history)
      )
        stopPresentation()
    })
    const workspaceCleanup = useWorkspace.subscribe((next) => {
      if (next.screen !== 'editor') stopPresentation()
    })
    unsubscribe = () => {
      editorCleanup()
      workspaceCleanup()
    }
    state = usePresentation.getState()
  }
  const editor = useEditor.getState()
  const step = state.steps[index]
  if (!step || !editor.history.document.topics[step.topicId]) return
  usePresentation.setState({
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

export const stopPresentation = (): void => {
  const state = usePresentation.getState()
  unsubscribe?.()
  unsubscribe = undefined
  if (!state.playing || !state.snapshot || !state.sheetId) return
  const { snapshot, sheetId } = state
  const editor = useEditor.getState()
  const belongs =
    editor.workbook.id === state.workbookId &&
    (editor.activeSheetId === sheetId ? editor.history : editor.sessions[sheetId]?.history) ===
      snapshot.history
  usePresentation.setState({
    playing: false,
    snapshot: null,
    cameraRequest: null,
    viewportRequest: null,
  })
  if (!belongs) return
  useEditor.setState((current) => {
    const views = Object.fromEntries(Object.entries(current.views).filter(([id]) => id !== sheetId))
    if (snapshot.view) views[sheetId] = snapshot.view
    const session = current.sessions[sheetId]
    return {
      views,
      ...(current.activeSheetId === sheetId ? { selectedId: snapshot.selectedId } : {}),
      ...(session
        ? {
            sessions: {
              ...current.sessions,
              [sheetId]: { ...session, selectedId: snapshot.selectedId },
            },
          }
        : {}),
    }
  })
  useSelection.setState((current) => {
    const sheets = Object.fromEntries(
      Object.entries(current.sheets).filter(([id]) => id !== sheetId),
    )
    if (snapshot.selection) sheets[sheetId] = snapshot.selection
    return { sheets }
  })
  useSpatialView.setState((current) => {
    const sheets = Object.fromEntries(
      Object.entries(current.sheets).filter(([id]) => id !== sheetId),
    )
    if (snapshot.spatial) sheets[sheetId] = snapshot.spatial
    return { sheets }
  })
  usePresentation.setState({
    cameraRequest: snapshot.spatial?.camera
      ? { id: crypto.randomUUID(), sheetId, camera: snapshot.spatial.camera }
      : null,
    viewportRequest: snapshot.view
      ? { id: crypto.randomUUID(), sheetId, view: snapshot.view }
      : null,
  })
}

export const presentationDocument = (
  document: MindMapDocument,
  topicId: string | undefined,
): MindMapDocument => {
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
