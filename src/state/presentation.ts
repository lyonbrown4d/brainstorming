import { create } from 'zustand'
import { type HistoryState, type MindMapDocument, type PresentationStep } from '@core'
import { useEditor } from '@renderer/state/editor'
import type { SheetView } from '@renderer/state/editorTypes'
import { useWorkspace } from '@renderer/state/workspace'
import { useSelection } from '@renderer/state/selection'
import { presentationPlan } from '@core/presentation-plan'
import {
  cancelPendingPresentation,
  deferPresentationUntilCommitted,
  setPendingPresentationMode,
} from '@renderer/state/presentationPending'

export type PresentationMode = 'composer' | 'audience' | 'presenter'
interface PresentationSnapshot {
  history: HistoryState
  view: SheetView | undefined
  selectedId: string
  selection: readonly string[] | undefined
  returnToComposer: boolean
}
interface PresentationState {
  workspaceMode: PresentationMode | null
  sheetId: string | null
  workbookId: string | null
  index: number
  composerIndex: number
  itemIndex: number
  startedAt: number | null
  playing: boolean
  steps: readonly PresentationStep[]
  generated: boolean
  snapshot: PresentationSnapshot | null
  /** Compatibility for canvas subscribers; slide playback never requests a camera. */
  cameraRequest: {
    id: string
    sheetId: string
    camera: NonNullable<PresentationStep['camera']>
  } | null
  viewportRequest: { id: string; sheetId: string; view: SheetView } | null
}
export const usePresentation = create<PresentationState>(() => ({
  workspaceMode: null,
  sheetId: null,
  workbookId: null,
  index: 0,
  composerIndex: 0,
  itemIndex: 0,
  startedAt: null,
  playing: false,
  steps: [],
  generated: false,
  snapshot: null,
  cameraRequest: null,
  viewportRequest: null,
}))
let unsubscribe: (() => void) | undefined

/** The root overview and first-level branches form slides; generation itself is transient. */
export const presentationSteps = presentationPlan

export const openPresentationComposer = (): void => {
  cancelPendingPresentation()
  const editor = useEditor.getState()
  editor.commitDraft()
  if (useEditor.getState().editingId || editor.busy) return
  const current = usePresentation.getState()
  usePresentation.setState({
    workspaceMode: 'composer',
    sheetId: editor.activeSheetId,
    workbookId: editor.workbook.id,
    composerIndex:
      current.sheetId === editor.activeSheetId && current.workbookId === editor.workbook.id
        ? current.composerIndex
        : 0,
  })
}

export const selectPresentationPage = (composerIndex: number): void => {
  cancelPendingPresentation()
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  if (
    Number.isInteger(composerIndex) &&
    presentationSteps(useEditor.getState().history.document)[composerIndex]
  )
    usePresentation.setState({ composerIndex })
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
    if (
      deferPresentationUntilCommitted((mode) => {
        showPresentationStep(index)
        setPresentationMode(mode)
      })
    )
      return
    const steps = presentationSteps(editor.history.document).filter((step) => !step.hidden)
    if (!steps[index]) return
    const sheetId = editor.activeSheetId
    usePresentation.setState({
      playing: true,
      workspaceMode: 'audience',
      sheetId,
      workbookId: editor.workbook.id,
      steps,
      generated: !editor.history.document.presentation?.length,
      startedAt: Date.now(),
      snapshot: {
        history: editor.history,
        view: editor.views[sheetId],
        selectedId: editor.selectedId,
        selection: useSelection.getState().sheets[sheetId],
        returnToComposer: state.workspaceMode === 'composer',
      },
      viewportRequest: null,
      cameraRequest: null,
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
      if (next.screen !== 'editor') closePresentationWorkspace()
    })
    unsubscribe = () => {
      editorCleanup()
      workspaceCleanup()
    }
    state = usePresentation.getState()
  }
  if (!state.steps[index]) return
  const step = state.steps[index]
  const count = presentationItemCount(useEditor.getState().history.document, step)
  usePresentation.setState({ index, itemIndex: step.reveal !== 'items' && count > 6 ? 6 : 0 })
}

export const presentationItemCount = (document: MindMapDocument, step: PresentationStep): number =>
  document.topics[step.topicId]?.children.filter(
    (id) => step.topicId !== document.rootId || !document.floatingIds?.includes(id),
  ).length ?? 0

export const advancePresentation = (direction: 1 | -1): void => {
  const state = usePresentation.getState()
  const step = state.steps[state.index]
  if (!state.playing || !step) return
  const total = presentationItemCount(useEditor.getState().history.document, step)
  const count = step.reveal === 'items' || total > 6 ? total : 0
  const increment = step.reveal === 'items' ? 1 : 6
  const minimum = step.reveal !== 'items' && total > 6 ? 6 : 0
  if (direction === 1 && state.itemIndex < count)
    usePresentation.setState({ itemIndex: Math.min(count, state.itemIndex + increment) })
  else if (direction === -1 && state.itemIndex > minimum)
    usePresentation.setState({ itemIndex: Math.max(minimum, state.itemIndex - increment) })
  else {
    const next = state.index + direction
    if (next >= 0 && next < state.steps.length) showPresentationStep(next)
  }
}

export const setPresentationMode = (workspaceMode: 'audience' | 'presenter'): void => {
  if (usePresentation.getState().playing) usePresentation.setState({ workspaceMode })
  else setPendingPresentationMode(workspaceMode)
}

export const stopPresentation = (): void => {
  cancelPendingPresentation()
  const state = usePresentation.getState()
  unsubscribe?.()
  unsubscribe = undefined
  const editor = useEditor.getState()
  const belongs =
    editor.workbook.id === state.workbookId &&
    editor.activeSheetId === state.sheetId &&
    editor.history === state.snapshot?.history
  if (belongs && state.snapshot && state.sheetId) {
    const snapshot = state.snapshot
    const sheetId = state.sheetId
    if (editor.selectedId !== snapshot.selectedId || editor.views[sheetId] !== snapshot.view) {
      const views = Object.fromEntries(
        Object.entries(editor.views).filter(([id]) => id !== sheetId),
      )
      if (snapshot.view) views[sheetId] = snapshot.view
      useEditor.setState({ selectedId: snapshot.selectedId, views })
    }
    if (useSelection.getState().sheets[sheetId] !== snapshot.selection) {
      const sheets = Object.fromEntries(
        Object.entries(useSelection.getState().sheets).filter(([id]) => id !== sheetId),
      )
      if (snapshot.selection) sheets[sheetId] = snapshot.selection
      useSelection.setState({ sheets })
    }
  }
  usePresentation.setState({
    playing: false,
    workspaceMode: belongs && state.snapshot?.returnToComposer ? 'composer' : null,
    snapshot: null,
    startedAt: null,
    cameraRequest: null,
    viewportRequest:
      belongs && state.snapshot?.view && state.sheetId
        ? { id: crypto.randomUUID(), sheetId: state.sheetId, view: state.snapshot.view }
        : null,
  })
  // Navigation never writes canvas/history; a native selection/view change still restores safely.
}

export const closePresentationWorkspace = (): void => {
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  stopPresentation()
  usePresentation.setState({ workspaceMode: null })
}

/** Compatibility for canvas renderers: slides are independent from the source canvas. */
export const presentationDocument: (
  document: MindMapDocument,
  topicId: string | undefined,
) => MindMapDocument = (document) => document
