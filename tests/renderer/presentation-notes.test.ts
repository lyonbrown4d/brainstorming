import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, deserializeWorkbook } from '@core'
import { isDirty, useEditor } from '@renderer/state/editor'
import { serializedDocumentSnapshot } from '@renderer/state/documentSnapshot'
import {
  editPresentationPages,
  isPresentationNoteDraft,
  startPresentationNotes,
  type PresentationNoteTarget,
} from '@renderer/state/presentationEditing'
import {
  closePresentationWorkspace,
  openPresentationComposer,
  selectPresentationPage,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'
import {
  openDocumentTab,
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { startDocumentAutosave } from '@renderer/state/documentAutosave'
import { desktop } from '@tests/fixtures/desktop'
import type { SaveRequest } from '@shared/contracts'

const target = (pageIndex = 0): PresentationNoteTarget => {
  const state = useEditor.getState()
  return {
    workbookId: state.workbook.id,
    sheetId: state.activeSheetId,
    documentId: state.history.document.id,
    topicId: pageIndex === 0 ? 'root' : 'a',
    pageIndex,
  }
}
const editNotes = (notes: string, pageIndex = 0): PresentationNoteTarget => {
  const binding = target(pageIndex)
  expect(startPresentationNotes(binding)).toBe(true)
  useEditor.getState().setDraft(notes)
  return binding
}

beforeEach(() => {
  usePresentation.setState(usePresentation.getInitialState(), true)
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.getState().replace(
    applyCommand(createDocument('First', 'first'), {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'root', id: 'a', title: 'Branch' },
        { type: 'setTopicNotes', topicId: 'a', notes: 'Source notes' },
      ],
    }),
  )
  openPresentationComposer()
})
afterEach(() => {
  useEditor.getState().cancelEdit()
  closePresentationWorkspace()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('presentation notes share the editor draft', () => {
  it('snapshots live notes without history or selection changes and commits one undo', () => {
    useEditor.getState().select('a')
    const before = useEditor.getState()
    const binding = editNotes('正在组词')
    useEditor.getState().setDraft('完整的演讲备注')
    const contents = serializedDocumentSnapshot(useEditor.getState())
    expect(deserializeWorkbook(contents).sheets[0]?.document.presentation?.[0]?.notes).toBe(
      '完整的演讲备注',
    )
    expect(useEditor.getState().history).toBe(before.history)
    expect(useEditor.getState().selectedId).toBe('a')
    expect(isPresentationNoteDraft(useEditor.getState(), binding)).toBe(true)
    expect(isDirty()).toBe(true)
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(serializedDocumentSnapshot(useEditor.getState())).toBe(contents)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(before.history.document)
  })

  it('inherits topic notes until changed, allows an explicit empty note and reopens after Save', () => {
    const binding = target(1)
    startPresentationNotes(binding)
    expect(useEditor.getState().draft).toBe('Source notes')
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.past).toHaveLength(0)
    editNotes('', 1)
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.document.presentation?.[1]?.notes).toBe('')
    expect(startPresentationNotes(binding)).toBe(true)
    expect(useEditor.getState().draft).toBe('')
    useEditor.getState().setDraft('After Save')
    useEditor.getState().commitDraft()
    expect(useEditor.getState().history.past).toHaveLength(2)
    expect(useEditor.getState().history.document.topics.a?.notes).toBe('Source notes')
  })

  it('commits before page selection, settings and playback even when no blur occurs', () => {
    editNotes('Overview')
    selectPresentationPage(1)
    expect(useEditor.getState().history.document.presentation?.[0]?.notes).toBe('Overview')
    editNotes('Branch speaker notes', 1)
    editPresentationPages((steps) =>
      steps.map((step, index) => (index === 1 ? { ...step, layout: 'list' } : step)),
    )
    expect(useEditor.getState().history.document.presentation?.[1]).toMatchObject({
      layout: 'list',
      notes: 'Branch speaker notes',
    })
    editNotes('Final notes', 1)
    showPresentationStep(0)
    expect(useEditor.getState().editingId).toBeNull()
    expect(usePresentation.getState().steps[1]?.notes).toBe('Final notes')
    stopPresentation()
    editNotes('Return to canvas', 1)
    closePresentationWorkspace()
    expect(useEditor.getState().history.document.presentation?.[1]?.notes).toBe('Return to canvas')
  })

  it('commits to the outgoing sheet and tab and rejects callbacks from their old textarea', () => {
    openDocumentTab(useEditor.getState().workbook, '/first.brainstorming')
    const firstTab = useDocumentTabs.getState().activeId
    const firstSheet = useEditor.getState().activeSheetId
    const oldBinding = editNotes('First sheet')
    useEditor.getState().addSheet()
    expect(startPresentationNotes(oldBinding)).toBe(false)
    useEditor.getState().switchSheet(firstSheet)
    expect(useEditor.getState().history.document.presentation?.[0]?.notes).toBe('First sheet')
    editNotes('First tab')
    openDocumentTab(createDocument('Second', 'second'), '/second.brainstorming')
    expect(startPresentationNotes(oldBinding)).toBe(false)
    expect(isPresentationNoteDraft(useEditor.getState(), oldBinding)).toBe(false)
    expect(useEditor.getState().history.document.presentation).toBeUndefined()
    expect(firstTab && switchDocumentTab(firstTab)).toBe(true)
    expect(useEditor.getState().history.document.presentation?.[0]?.notes).toBe('First tab')
  })

  it('keeps invalid notes editable and blocks navigation without partially saving', () => {
    editNotes('长'.repeat(10_001))
    expect(() => serializedDocumentSnapshot(useEditor.getState())).toThrow()
    selectPresentationPage(1)
    showPresentationStep(0)
    closePresentationWorkspace()
    expect(useEditor.getState().editingSurface).toBe('presentation-notes')
    expect(useEditor.getState().history.past).toHaveLength(0)
    expect(usePresentation.getState()).toMatchObject({
      workspaceMode: 'composer',
      composerIndex: 0,
      playing: false,
    })
    expect(useEditor.getState().error).toBeTruthy()
  })

  it('autosaves the live note while preserving the edit session and undo history', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
    const persist = vi.fn((request: SaveRequest) => Promise.resolve(request.path))
    desktop({ saveDocument: persist })
    useEditor.setState({ path: '/first.brainstorming' })
    synchronizeDocumentTab()
    const stop = startDocumentAutosave()
    try {
      const binding = editNotes('Autosaved without blur')
      const before = useEditor.getState()
      await vi.advanceTimersByTimeAsync(700)
      expect(persist).toHaveBeenCalledTimes(1)
      const request = persist.mock.calls[0]?.[0]
      if (!request) throw new Error('Missing autosave request')
      expect(
        deserializeWorkbook(request.contents).sheets[0]?.document.presentation?.[0]?.notes,
      ).toBe('Autosaved without blur')
      expect(useEditor.getState().history).toBe(before.history)
      expect(isPresentationNoteDraft(useEditor.getState(), binding)).toBe(true)
      expect(isDirty()).toBe(false)
    } finally {
      stop()
    }
  })
})
