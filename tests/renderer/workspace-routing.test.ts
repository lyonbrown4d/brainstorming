import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import { useEditor } from '@renderer/state/editor'
import {
  closeDocumentTab,
  openDocumentTab,
  switchDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { beginCreation, cancelCreation, showWorkspaceHome } from '@renderer/state/creation'
import { closePresentationWorkspace, usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'
import { createWorkspaceRouteBridge } from '@renderer/routing/workspaceBridge'
import { applyWorkspacePath } from '@renderer/routing/workspaceNavigation'
import {
  canonicalWorkspacePath,
  matchWorkspacePath,
  sheetPath,
  validSettingsReturn,
} from '@renderer/routing/workspacePaths'
import { desktop } from '@tests/fixtures/desktop'

const activeTab = (): string => {
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('No active tab')
  return id
}
const workbook = () =>
  applyWorkbookCommand(createWorkbook(createDocument('First', 'first')), {
    type: 'addSheet',
    sheet: { id: 'second', name: 'Second', document: createDocument('Second', 'second') },
  })
let dispose: () => void = () => undefined
beforeEach(() => {
  closePresentationWorkspace()
  vi.stubGlobal('window', { brainstorming: desktop(), confirm: () => true })
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})
afterEach(() => {
  dispose()
  closePresentationWorkspace()
  vi.unstubAllGlobals()
})

const bridge = () => {
  const navigate = vi.fn()
  const connection = createWorkspaceRouteBridge(navigate)
  dispose = connection.dispose
  return { ...connection, navigate }
}

describe('workspace route/session bridge', () => {
  it('matches explicit views and round-trips encoded document/sheet identifiers', () => {
    expect(matchWorkspacePath(sheetPath('tab one', 'sheet/one'))).toMatchObject({
      id: 'editor',
      tabId: 'tab one',
      sheetId: 'sheet/one',
    })
    expect(matchWorkspacePath('/create/document')?.id).toBe('create-document')
    expect(matchWorkspacePath('/documents/a/sheets/b/presentation/presenter')?.id).toBe('presenter')
    expect(matchWorkspacePath('/documents/a/sheets/b/unrecognized')).toBeUndefined()
  })

  it('routes between documents and sheets through draft commits without mixing histories', () => {
    openDocumentTab(workbook(), '/first.brainstorming')
    const first = activeTab()
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('First draft')
    const connection = bridge()
    connection.applyLocation(sheetPath(first, 'second'))
    expect(useEditor.getState().history.document.title).toBe('Second')
    openDocumentTab(createDocument('Other', 'other'), '/other.brainstorming')
    const other = activeTab()
    connection.applyLocation(sheetPath(first, 'first'))
    expect(useEditor.getState().history.document.title).toBe('First draft')
    expect(useEditor.getState().history.past).toHaveLength(1)
    connection.applyLocation(sheetPath(other, 'other'))
    expect(useEditor.getState().history.document.title).toBe('Other')
    expect(useEditor.getState().history.past).toHaveLength(0)
    expect(connection.navigate).not.toHaveBeenCalled()
  })

  it('coalesces a user switch into one push and applies Back without a reverse push', async () => {
    openDocumentTab(workbook())
    const first = activeTab()
    openDocumentTab(createDocument('Other', 'other'))
    const otherPath = canonicalWorkspacePath()
    const connection = bridge()
    connection.applyLocation(otherPath)
    switchDocumentTab(first)
    useEditor.getState().switchSheet('second')
    await Promise.resolve()
    expect(connection.navigate.mock.calls).toEqual([
      [sheetPath(first, 'second'), { replace: false }],
    ])
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('Fresh draft after switching')
    connection.applyLocation(sheetPath(first, 'second'))
    expect(useEditor.getState().editingId).toBe('root')
    expect(useEditor.getState().draft).toBe('Fresh draft after switching')
    connection.applyLocation(otherPath)
    await Promise.resolve()
    expect(useEditor.getState().history.document.title).toBe('Other')
    expect(connection.navigate).toHaveBeenCalledTimes(1)
  })

  it('replaces invalid/closed tabs and missing sheets with actual open routes', async () => {
    openDocumentTab(workbook())
    const first = activeTab()
    const connection = bridge()
    connection.applyLocation(sheetPath(first, 'missing'))
    expect(connection.navigate).toHaveBeenLastCalledWith(sheetPath(first, 'first'), {
      replace: true,
    })
    openDocumentTab(createDocument('Other', 'other'))
    const removed = canonicalWorkspacePath()
    closeDocumentTab(activeTab())
    await Promise.resolve()
    connection.navigate.mockClear()
    connection.applyLocation(removed)
    expect(connection.navigate).toHaveBeenCalledWith(sheetPath(first, 'first'), { replace: true })
    expect(useDocumentTabs.getState().tabs).toHaveLength(1)
    expect(validSettingsReturn(removed)).toBeUndefined()
  })

  it('keeps busy and invalid drafts in place when history requests another view', () => {
    openDocumentTab(workbook())
    const original = canonicalWorkspacePath()
    const connection = bridge()
    connection.applyLocation(original)
    useEditor.setState({ busy: true })
    connection.applyLocation('/home')
    expect(connection.navigate).toHaveBeenLastCalledWith(original, { replace: true })
    expect(useWorkspace.getState().screen).toBe('editor')
    useEditor.setState({ busy: false })
    useEditor.getState().startEdit('root', undefined, 'notes')
    useEditor.getState().setDraft('x'.repeat(100_001))
    connection.applyLocation('/create/document')
    expect(useEditor.getState().editingId).toBe('root')
    expect(useEditor.getState().draft).toHaveLength(100_001)
    expect(useWorkspace.getState().screen).toBe('editor')
    expect(connection.navigate).toHaveBeenLastCalledWith(original, { replace: true })
  })

  it('routes creation/cancel/home and cannot create a sheet without a document', async () => {
    expect(applyWorkspacePath('/create/sheet')).toBe('/home')
    openDocumentTab(workbook())
    const original = canonicalWorkspacePath()
    const connection = bridge()
    connection.applyLocation(original)
    beginCreation('sheet')
    await Promise.resolve()
    expect(connection.navigate).toHaveBeenLastCalledWith('/create/sheet/structure', {
      replace: false,
    })
    connection.applyLocation('/create/sheet')
    useWorkspace.setState({ creationStep: 2 })
    connection.applyLocation('/settings')
    expect(useWorkspace.getState()).toMatchObject({ screen: 'create-sheet', creationStep: 2 })
    connection.applyLocation('/create/sheet/configuration')
    expect(useWorkspace.getState().creationStep).toBe(2)
    cancelCreation()
    await Promise.resolve()
    expect(connection.navigate).toHaveBeenLastCalledWith(original, { replace: false })
    showWorkspaceHome()
    await Promise.resolve()
    expect(connection.navigate).toHaveBeenLastCalledWith('/home', { replace: false })
  })

  it('addresses composer/presenter/play using the existing presentation state', () => {
    openDocumentTab(workbook())
    const original = canonicalWorkspacePath()
    const connection = bridge()
    connection.applyLocation(`${original}/presentation`)
    const history = useEditor.getState().history
    expect(usePresentation.getState().workspaceMode).toBe('composer')
    connection.applyLocation(`${original}/presentation/presenter`)
    expect(usePresentation.getState()).toMatchObject({ playing: true, workspaceMode: 'presenter' })
    connection.applyLocation(`${original}/presentation/play`)
    expect(usePresentation.getState().workspaceMode).toBe('audience')
    connection.applyLocation(original)
    expect(usePresentation.getState()).toMatchObject({ playing: false, workspaceMode: null })
    expect(useEditor.getState().history).toBe(history)
    expect(connection.navigate).not.toHaveBeenCalled()
  })

  it('suspends background pushes while Settings is open and cancels queued work on dispose', async () => {
    openDocumentTab(workbook())
    const connection = bridge()
    connection.applyLocation('/settings')
    useEditor.getState().switchSheet('second')
    await Promise.resolve()
    expect(connection.navigate).not.toHaveBeenCalled()
    expect(validSettingsReturn('/settings')).toBeUndefined()
    connection.applyLocation(canonicalWorkspacePath())
    showWorkspaceHome()
    connection.dispose()
    await Promise.resolve()
    expect(connection.navigate).not.toHaveBeenCalled()
  })
})
