import { useDocumentTabs, switchDocumentTab } from '@renderer/state/documentTabs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import {
  beginCreation,
  cancelCreation,
  createFromRequest,
  exploreExample,
  showWorkspaceHome,
} from '@renderer/state/creation'
import { isDirty, useEditor } from '@renderer/state/editor'
import { newDocument } from '@renderer/state/files'
import { resetFileSecurityState, useFileSecurityState } from '@renderer/state/password'
import { enterWorkspaceEditor, useWorkspace } from '@renderer/state/workspace'
import { useSearch } from '@renderer/state/search'

const discardPrompt = vi.fn(() => true)
const request = { title: ' 新的计划 ', layout: 'brace-left', template: 'blank' } as const
beforeEach(() => {
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  discardPrompt.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', { confirm: discardPrompt })
  useEditor.getState().replace(createDocument('已有导图'), '/existing.brainstorming')
  useEditor.setState({ busy: false })
  enterWorkspaceEditor()
  resetFileSecurityState()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const dirty = () => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '未保存的内容' })
}

describe('full-page document and sheet creation', () => {
  it('closes search on guide, Home and document replacement without losing the query', () => {
    useSearch.setState({ open: true, query: '已有' })
    expect(beginCreation('document')).toBe(true)
    expect(useSearch.getState()).toMatchObject({ open: false, query: '已有' })
    cancelCreation()
    expect(useSearch.getState().open).toBe(false)
    useSearch.setState({ open: true })
    expect(showWorkspaceHome()).toBe(true)
    enterWorkspaceEditor()
    expect(useSearch.getState().open).toBe(false)
    useSearch.setState({ open: true })
    useEditor.getState().replace(createDocument('打开的导图'))
    expect(useSearch.getState().open).toBe(false)
  })

  it('opens and cancels a document guide without replacing a dirty workbook or confirming discard', () => {
    dirty()
    const current = useEditor.getState()
    newDocument()
    expect(useWorkspace.getState().screen).toBe('create-document')
    expect(useEditor.getState().workbook).toBe(current.workbook)
    expect(discardPrompt).not.toHaveBeenCalled()
    cancelCreation()
    expect(useWorkspace.getState().screen).toBe('editor')
    expect(useEditor.getState().workbook).toBe(current.workbook)
    expect(useEditor.getState().path).toBe('/existing.brainstorming')
    expect(isDirty()).toBe(true)
  })

  it('returns to Home after cancelling creation without a user document', () => {
    useWorkspace.setState({ screen: 'home', hasDocument: false, returnScreen: 'home' })
    const before = useEditor.getState().workbook
    expect(beginCreation('sheet')).toBe(false)
    expect(beginCreation('document')).toBe(true)
    cancelCreation()
    expect(useWorkspace.getState()).toMatchObject({ screen: 'home', hasDocument: false })
    expect(useEditor.getState().workbook).toBe(before)
  })

  it('creates a new tab without discarding the dirty document when discard would be declined', () => {
    dirty()
    beginCreation('document')
    const before = useEditor.getState().workbook
    discardPrompt.mockReturnValue(false)
    expect(createFromRequest(request)).toBe(true)
    expect(discardPrompt).not.toHaveBeenCalled()
    expect(useEditor.getState().history.document.title).toBe('新的计划')
    expect(useWorkspace.getState().screen).toBe('editor')
    const original = useDocumentTabs
      .getState()
      .tabs.find((tab) => tab.editor.workbook.id === before.id)
    expect(original?.editor.workbook).toBe(before)
    if (!original) throw new Error('Original document tab was lost')
    switchDocumentTab(original.id)
    expect(useEditor.getState().workbook).toBe(before)
    expect(useEditor.getState().path).toBe('/existing.brainstorming')
    expect(isDirty()).toBe(true)
  })

  it('creates a trimmed title with the selected structure, no seed history and a fresh password state', () => {
    const oldId = useEditor.getState().workbook.id
    useFileSecurityState.setState({ documentId: oldId, encrypted: true })
    dirty()
    beginCreation('document')
    expect(createFromRequest({ ...request, template: 'project' })).toBe(true)
    const state = useEditor.getState()
    expect(state.history.document.title).toBe('新的计划')
    expect(state.history.document.settings?.layout).toBe('brace-left')
    expect(Object.keys(state.history.document.topics)).toHaveLength(13)
    expect(state.history.past).toHaveLength(0)
    expect(state.structurePast).toHaveLength(0)
    expect(state.path).toBeNull()
    expect(isDirty()).toBe(true)
    expect(useFileSecurityState.getState()).toMatchObject({ documentId: null, encrypted: false })
    expect(useWorkspace.getState().screen).toBe('editor')
    expect(createFromRequest(request)).toBe(false)
    expect(useEditor.getState().workbook).toBe(state.workbook)
    const original = useDocumentTabs.getState().tabs.find((tab) => tab.editor.workbook.id === oldId)
    expect(original?.security).toMatchObject({ documentId: oldId, encrypted: true })
    if (!original) throw new Error('Protected document tab was lost')
    switchDocumentTab(original.id)
    expect(useFileSecurityState.getState()).toMatchObject({ documentId: oldId, encrypted: true })
  })

  it.each(['document', 'sheet'] as const)('uses the default blank %s name', (mode) => {
    beginCreation(mode)
    expect(createFromRequest({ ...request, title: ' \n ' })).toBe(true)
    expect(useEditor.getState().history.document.title).toBe(
      mode === 'document' ? '新的想法' : '新画布',
    )
  })

  it('adds a Sheet in one undo with independent structure, preserving path, password and workbook serialization', () => {
    useEditor.getState().command({ type: 'setDocumentSettings', settings: { layout: 'tree-up' } })
    const original = useEditor.getState().workbook
    useFileSecurityState.setState({ documentId: original.id, encrypted: true })
    beginCreation('sheet')
    expect(createFromRequest({ ...request, layout: 'timeline-vertical' })).toBe(true)
    const state = useEditor.getState()
    expect(state.workbook.sheets.map(({ document }) => document.settings?.layout)).toEqual([
      'tree-up',
      'timeline-vertical',
    ])
    expect(state.history.past).toHaveLength(0)
    expect(state.structurePast).toHaveLength(1)
    expect(state.path).toBe('/existing.brainstorming')
    expect(useFileSecurityState.getState()).toMatchObject({
      documentId: original.id,
      encrypted: true,
    })
    expect(deserializeWorkbook(serializeWorkbook(state.workbook))).toEqual(state.workbook)
    state.undo()
    expect(useEditor.getState().workbook).toEqual(original)
    state.redo()
    expect(useEditor.getState().workbook).toEqual(state.workbook)
    expect(discardPrompt).not.toHaveBeenCalled()
  })

  it('rejects a stale Sheet guide and keeps its error visible', () => {
    beginCreation('sheet')
    useEditor.getState().replace(createDocument('另一份工作簿', 'other'))
    // Simulate a stale gallery submission retaining the old creation target.
    useWorkspace.setState({ screen: 'create-sheet', creationWorkbookId: 'stale-workbook' })
    const before = useEditor.getState().workbook
    expect(createFromRequest(request)).toBe(false)
    expect(useEditor.getState().workbook).toBe(before)
    expect(useEditor.getState().error).toContain('工作簿已更改')
    expect(useWorkspace.getState().screen).toBe('create-sheet')
  })

  it('blocks busy actions and keeps a validation failure in the creation guide', () => {
    useEditor.setState({ busy: true })
    expect(beginCreation('document')).toBe(false)
    expect(showWorkspaceHome()).toBe(false)
    expect(exploreExample()).toBe(false)
    useEditor.setState({ busy: false })
    beginCreation('document')
    const before = useEditor.getState().workbook
    useEditor.setState({ busy: true })
    expect(createFromRequest(request)).toBe(false)
    cancelCreation()
    expect(useWorkspace.getState().screen).toBe('create-document')
    useEditor.setState({ busy: false })
    expect(createFromRequest({ ...request, title: '长'.repeat(81) })).toBe(false)
    expect(useEditor.getState().error).toContain('80')
    expect(useEditor.getState().workbook).toBe(before)
    expect(useWorkspace.getState().screen).toBe('create-document')
  })

  it('commits a draft before Home and blocks navigation when an invalid draft cannot commit', () => {
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('保留草稿')
    expect(showWorkspaceHome()).toBe(true)
    expect(useEditor.getState().history.document.title).toBe('保留草稿')
    expect(isDirty()).toBe(true)
    enterWorkspaceEditor()
    useEditor.getState().startEdit('root', undefined, 'notes')
    useEditor.getState().setDraft('长'.repeat(100_001))
    expect(beginCreation('document')).toBe(false)
    expect(showWorkspaceHome()).toBe(false)
    expect(useWorkspace.getState().screen).toBe('editor')
    expect(useEditor.getState().editingId).toBe('root')
  })

  it('explores the example from initial Home and reuses its dirty tab without discarding edits', () => {
    useWorkspace.setState({ screen: 'home', hasDocument: false })
    dirty()
    discardPrompt.mockReturnValue(false)
    expect(exploreExample()).toBe(true)
    expect(discardPrompt).not.toHaveBeenCalled()
    expect(useEditor.getState().workbook.sheets).toHaveLength(3)
    expect(useWorkspace.getState()).toMatchObject({ screen: 'editor', hasDocument: true })
    dirty()
    const before = useEditor.getState().workbook
    expect(showWorkspaceHome()).toBe(true)
    expect(exploreExample()).toBe(true)
    expect(discardPrompt).not.toHaveBeenCalled()
    expect(useEditor.getState().workbook).toBe(before)
    expect(useDocumentTabs.getState().tabs).toHaveLength(1)
    expect(useWorkspace.getState().screen).toBe('editor')
  })
})
