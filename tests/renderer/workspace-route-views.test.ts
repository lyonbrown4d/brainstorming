import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import { desktop } from '@tests/fixtures/desktop'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab, switchDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { updateCreationDraft, useWorkspace } from '@renderer/state/workspace'
import { createFromRequest } from '@renderer/state/creation'
import {
  closeInspector,
  selectCanvasSection,
  selectInspectorMode,
} from '@renderer/state/inspectorNavigation'
import { closePresentationWorkspace } from '@renderer/state/presentation'
import { createWorkspaceRouteBridge } from '@renderer/routing/workspaceBridge'
import { applyWorkspacePath } from '@renderer/routing/workspaceNavigation'
import {
  canonicalWorkspacePath,
  matchWorkspacePath,
  sheetPath,
} from '@renderer/routing/workspacePaths'

let dispose: () => void = () => undefined
beforeEach(() => {
  vi.stubGlobal('window', { brainstorming: desktop(), confirm: () => true })
  closePresentationWorkspace()
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})
afterEach(() => {
  dispose()
  closePresentationWorkspace()
  vi.unstubAllGlobals()
})
const connection = () => {
  const navigate = vi.fn()
  const bridge = createWorkspaceRouteBridge(navigate)
  dispose = bridge.dispose
  bridge.applyLocation(canonicalWorkspacePath())
  return { ...bridge, navigate }
}
const openFixture = () => {
  openDocumentTab(
    applyWorkbookCommand(createWorkbook(createDocument('First', 'first')), {
      type: 'addSheet',
      sheet: { id: 'second', name: 'Second', document: createDocument('Second', 'second') },
    }),
  )
  return canonicalWorkspacePath()
}

describe('creation steps and property views', () => {
  it('normalizes old creation links and keeps drafts across Back, Forward, Settings and leaving the guide', async () => {
    const bridge = connection()
    bridge.applyLocation('/create/document')
    expect(bridge.navigate).toHaveBeenLastCalledWith('/create/document/structure', {
      replace: true,
    })
    const draft = { title: 'Unsubmitted plan', layout: 'brace-right', template: 'project' } as const
    updateCreationDraft('document', draft)
    useWorkspace.setState({ creationStep: 2 })
    await Promise.resolve()
    expect(bridge.navigate).toHaveBeenLastCalledWith('/create/document/configuration', {
      replace: false,
    })
    bridge.navigate.mockClear()
    bridge.applyLocation('/create/document/structure')
    expect(useWorkspace.getState().creationStep).toBe(1)
    bridge.applyLocation('/create/document/configuration')
    bridge.applyLocation('/settings')
    bridge.applyLocation('/create/document/configuration')
    expect(useWorkspace.getState().creationStep).toBe(2)
    bridge.applyLocation('/home')
    bridge.applyLocation('/create/document/configuration')
    expect(useWorkspace.getState().creationDrafts.document).toBe(draft)
    expect(useWorkspace.getState().creationStep).toBe(2)
    expect(useEditor.getState().history.document.title).not.toBe(draft.title)
    await Promise.resolve()
    expect(bridge.navigate).not.toHaveBeenCalled()
  })

  it('retains failed creation drafts, separates document/sheet choices, and clears only a successfully created draft', async () => {
    openFixture()
    const document = { title: 'Document draft', layout: 'map', template: 'blank' } as const
    const sheet = { title: 'x'.repeat(81), layout: 'timeline', template: 'study' } as const
    updateCreationDraft('document', document)
    updateCreationDraft('sheet', sheet)
    applyWorkspacePath('/create/sheet/configuration')
    expect(await createFromRequest(sheet)).toBe(false)
    expect(useWorkspace.getState().creationDrafts).toEqual({ document, sheet })
    expect(useWorkspace.getState().creationStep).toBe(2)
    const accepted = { ...sheet, title: 'New sheet' }
    updateCreationDraft('sheet', accepted)
    expect(await createFromRequest(accepted)).toBe(true)
    expect(useWorkspace.getState().creationDrafts).toEqual({
      document,
      sheet: { title: '', layout: 'map', template: 'blank' },
    })
  })

  it('opens the requested property tab/section, closes to canvas and never adds model history', async () => {
    const base = openFixture()
    const history = useEditor.getState().history
    const bridge = connection()
    bridge.applyLocation(`${base}/style/canvas`)
    expect(canonicalWorkspacePath()).toBe(`${base}/style/canvas/structure`)
    expect(bridge.navigate).toHaveBeenLastCalledWith(`${base}/style/canvas/structure`, {
      replace: true,
    })
    bridge.navigate.mockClear()
    selectCanvasSection('appearance')
    await Promise.resolve()
    expect(bridge.navigate).toHaveBeenLastCalledWith(`${base}/style/canvas/appearance`, {
      replace: false,
    })
    bridge.applyLocation(`${base}/style/topic`)
    expect(useEditor.getState()).toMatchObject({ inspectorOpen: true, inspectorMode: 'topic' })
    bridge.applyLocation(`${base}/style/canvas/template`)
    expect(useEditor.getState()).toMatchObject({
      inspectorMode: 'canvas',
      canvasSection: 'template',
    })
    bridge.applyLocation('/settings')
    expect(useEditor.getState().canvasSection).toBe('template')
    bridge.applyLocation(`${base}/style/canvas/template`)
    closeInspector()
    await Promise.resolve()
    expect(bridge.navigate).toHaveBeenLastCalledWith(base, { replace: false })
    expect(useEditor.getState().history).toBe(history)
  })

  it('uses the requested tab/sheet without changing another document session and repairs invalid sections', async () => {
    const base = openFixture()
    const first = useDocumentTabs.getState().activeId ?? ''
    selectCanvasSection('template')
    openDocumentTab(createDocument('Other', 'other'))
    const other = useDocumentTabs.getState().activeId ?? ''
    expect(useEditor.getState()).toMatchObject({
      inspectorMode: 'topic',
      canvasSection: 'structure',
    })
    selectInspectorMode('topic')
    const bridge = connection()
    bridge.applyLocation(`${sheetPath(first, 'second')}/style/canvas/appearance`)
    expect(useEditor.getState()).toMatchObject({
      activeSheetId: 'second',
      inspectorMode: 'canvas',
      canvasSection: 'appearance',
    })
    switchDocumentTab(other)
    await Promise.resolve()
    expect(canonicalWorkspacePath()).toBe(`${sheetPath(other, 'other')}/style/topic`)
    expect(useEditor.getState().history.document.title).toBe('Other')
    bridge.navigate.mockClear()
    bridge.applyLocation(`${base}/style/canvas/unknown`)
    expect(bridge.navigate).toHaveBeenLastCalledWith(canonicalWorkspacePath(), { replace: true })
    expect(useDocumentTabs.getState().activeId).toBe(other)
    expect(matchWorkspacePath('/create/document/unknown')).toBeUndefined()
  })

  it('guards property navigation on invalid drafts/busy and ignores selection or draft-only updates', async () => {
    const base = openFixture()
    const bridge = connection()
    useEditor.getState().startEdit('root', undefined, 'notes')
    useEditor.getState().setDraft('x'.repeat(100_001))
    bridge.applyLocation(`${base}/style/canvas/appearance`)
    expect(useEditor.getState()).toMatchObject({ inspectorOpen: false, editingId: 'root' })
    selectCanvasSection('template')
    expect(useEditor.getState().inspectorOpen).toBe(false)
    expect(useEditor.getState().draft).toHaveLength(100_001)
    useEditor.getState().cancelEdit()
    useEditor.setState({ busy: true })
    bridge.applyLocation('/create/document/configuration')
    expect(useWorkspace.getState().screen).toBe('editor')
    useEditor.setState({ busy: false })
    bridge.navigate.mockClear()
    useEditor.setState({ selectedId: 'root', draft: 'Transient draft' })
    updateCreationDraft('document', { title: 'Typing', layout: 'map', template: 'blank' })
    await Promise.resolve()
    expect(bridge.navigate).not.toHaveBeenCalled()
  })
})
