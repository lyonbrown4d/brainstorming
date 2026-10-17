import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import { useEditor } from '@renderer/state/editor'
import {
  anyDocumentDirty,
  closeDocumentTab,
  openDocumentTab,
  switchDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { useSpatialView } from '@renderer/state/spatial'
import { resetFileSecurityState } from '@renderer/state/password'
import { desktop } from '@tests/fixtures/desktop'

const confirmDiscard = vi.fn(() => true)
const alpha = () =>
  applyWorkbookCommand(createWorkbook(createDocument('Alpha first', 'alpha'), 'Alpha'), {
    type: 'addSheet',
    sheet: {
      id: 'alpha-second',
      name: 'Second',
      document: createDocument('Alpha second', 'alpha-second'),
    },
  })
const beta = () => createWorkbook(createDocument('Beta', 'beta'))
const rename = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}
const activeId = (): string => {
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Missing active document tab')
  return id
}

beforeEach(() => {
  confirmDiscard.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', { trelyx: desktop(), confirm: confirmDiscard })
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useSpatialView.getState().reset()
  resetFileSecurityState()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('document tab sessions', () => {
  it('commits a draft to its original sheet and restores independent paths, histories and views', () => {
    openDocumentTab(alpha(), '/alpha.trelyx')
    const firstId = activeId()
    rename('Alpha first edited')
    useEditor.getState().switchSheet('alpha-second')
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('Alpha second draft')
    useEditor.setState({ views: { 'alpha-second': { x: 31, y: 42, zoom: 1.5 } } })
    useSpatialView.getState().setMode('alpha-second', '3d')
    expect(openDocumentTab(beta(), '/beta.trelyx')).toBe(true)
    const secondId = activeId()
    expect(useEditor.getState().draft).toBe('')
    expect(useEditor.getState().views).toEqual({})
    expect(useSpatialView.getState().sheets).toEqual({})
    rename('Beta edited')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.title).toBe('Beta')
    expect(switchDocumentTab(firstId)).toBe(true)
    expect(useEditor.getState().path).toBe('/alpha.trelyx')
    expect(useEditor.getState().activeSheetId).toBe('alpha-second')
    expect(useEditor.getState().history.document.title).toBe('Alpha second draft')
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(useEditor.getState().editingId).toBeNull()
    expect(useEditor.getState().views['alpha-second']).toEqual({ x: 31, y: 42, zoom: 1.5 })
    expect(useSpatialView.getState().sheets['alpha-second']?.mode).toBe('3d')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.title).toBe('Alpha second')
    useEditor.getState().switchSheet('alpha')
    expect(useEditor.getState().history.document.title).toBe('Alpha first edited')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.title).toBe('Alpha first')
    switchDocumentTab(secondId)
    expect(useEditor.getState().path).toBe('/beta.trelyx')
    expect(useEditor.getState().activeSheetId).toBe('beta')
    useEditor.getState().redo()
    expect(useEditor.getState().history.document.title).toBe('Beta edited')
    expect(useDocumentTabs.getState().tabs).toHaveLength(2)
  })

  it('keeps a background dirty tab on cancel, closes only that tab on confirmation, and returns home after the last close', () => {
    openDocumentTab(alpha(), '/alpha.trelyx')
    const firstId = activeId()
    rename('Unsaved Alpha')
    openDocumentTab(beta(), '/beta.trelyx')
    const secondId = activeId()
    const current = useEditor.getState().workbook
    expect(anyDocumentDirty()).toBe(true)
    confirmDiscard.mockReturnValueOnce(false)
    expect(closeDocumentTab(firstId)).toBe(false)
    expect(useDocumentTabs.getState().tabs.map((tab) => tab.id)).toEqual([firstId, secondId])
    expect(useDocumentTabs.getState().activeId).toBe(secondId)
    expect(useEditor.getState().workbook).toBe(current)
    expect(useDocumentTabs.getState().tabs[0]?.editor.history.document.title).toBe('Unsaved Alpha')
    expect(closeDocumentTab(firstId)).toBe(true)
    expect(useDocumentTabs.getState().tabs.map((tab) => tab.id)).toEqual([secondId])
    expect(useEditor.getState().path).toBe('/beta.trelyx')
    expect(anyDocumentDirty()).toBe(false)
    expect(closeDocumentTab(secondId)).toBe(true)
    expect(useDocumentTabs.getState().tabs).toEqual([])
    expect(useDocumentTabs.getState().activeId).toBeNull()
    expect(useWorkspace.getState()).toMatchObject({ screen: 'home', hasDocument: false })
    expect(confirmDiscard).toHaveBeenCalledTimes(2)
  })

  it('reuses the existing path or workbook identity without replacing unsaved content or its undo history', () => {
    const source = alpha()
    openDocumentTab(source, '/alpha.trelyx')
    const firstId = activeId()
    rename('Keep this draft')
    const history = useEditor.getState().history
    openDocumentTab(beta(), '/beta.trelyx')
    expect(openDocumentTab(source, '/alpha-copy.trelyx')).toBe(true)
    expect(activeId()).toBe(firstId)
    expect(useEditor.getState().path).toBe('/alpha.trelyx')
    expect(useEditor.getState().history).toBe(history)
    expect(useEditor.getState().history.document.title).toBe('Keep this draft')
    expect(
      openDocumentTab(createWorkbook(createDocument('Other identity', 'other')), '/alpha.trelyx'),
    ).toBe(true)
    expect(activeId()).toBe(firstId)
    expect(useDocumentTabs.getState().tabs).toHaveLength(2)
    expect(useEditor.getState().history).toBe(history)
  })
})
