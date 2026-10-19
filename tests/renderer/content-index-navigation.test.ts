import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyCommand, applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import type { ContentSearchResult } from '@shared/contentSearch'
import { useEditor } from '@renderer/state/editor'
import { closeDocumentTab, openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { useTopicFocusRequest } from '@renderer/state/viewport'
import { openContentSearchResult } from '@renderer/state/contentIndexNavigation'

beforeEach(() => {
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useTopicFocusRequest.setState({ request: null, sequence: 0 })
  vi.stubGlobal('window', { confirm: () => true })
})
afterEach(() => vi.unstubAllGlobals())

const targetWorkbook = () => {
  const child = applyCommand(createDocument('Target sheet', 'target-document'), {
    type: 'addTopic',
    id: 'child',
    parentId: 'root',
    title: 'Target topic',
  })
  const collapsed = applyCommand(child, { type: 'toggleCollapse', topicId: 'root' })
  return applyWorkbookCommand(createWorkbook(createDocument('First sheet', 'first')), {
    type: 'addSheet',
    sheet: { id: 'target-sheet', name: 'Second', document: collapsed },
  })
}
const resultFor = (workbookId: string): ContentSearchResult => ({
  workbookId,
  workbookTitle: 'Target workbook',
  sheetId: 'target-sheet',
  sheetName: 'Second',
  topicId: 'child',
  title: 'Target topic',
  snippet: 'Target topic',
})

it('commits the outgoing draft, activates the target document and sheet, and reveals ancestors once', () => {
  const workbook = targetWorkbook()
  openDocumentTab(workbook)
  openDocumentTab(createDocument('Outgoing', 'outgoing'))
  const outgoingId = useDocumentTabs.getState().activeId
  useEditor.getState().startEdit('root')
  useEditor.getState().setDraft('Draft preserved')
  expect(openContentSearchResult(resultFor(workbook.id))).toBe(true)
  const current = useEditor.getState()
  expect(current.workbook.id).toBe(workbook.id)
  expect(current.activeSheetId).toBe('target-sheet')
  expect(current.selectedId).toBe('child')
  expect(current.history.document.topics.root?.collapsed).toBe(false)
  expect(current.history.past).toHaveLength(1)
  expect(useTopicFocusRequest.getState().request).toMatchObject({
    workbookId: workbook.id,
    sheetId: 'target-sheet',
    topicId: 'child',
    document: current.history.document,
  })
  expect(
    useDocumentTabs.getState().tabs.find((tab) => tab.id === outgoingId)?.editor.history.document
      .title,
  ).toBe('Draft preserved')
  current.undo()
  expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(true)
})

it('rejects closed tabs, deleted sheets, and deleted topics without switching or requesting focus', () => {
  const workbook = targetWorkbook()
  openDocumentTab(workbook)
  const tabId = useDocumentTabs.getState().activeId
  if (!tabId) throw new Error('Missing tab')
  const result = resultFor(workbook.id)
  useEditor.getState().switchSheet('target-sheet')
  useEditor.getState().command({ type: 'deleteTopic', topicId: 'child' })
  const deletedTopic = useEditor.getState()
  expect(openContentSearchResult(result)).toBe(false)
  expect(useEditor.getState()).toBe(deletedTopic)
  useEditor.getState().deleteSheet('target-sheet')
  expect(openContentSearchResult(result)).toBe(false)
  closeDocumentTab(tabId)
  expect(openContentSearchResult(result)).toBe(false)
  expect(useTopicFocusRequest.getState().request).toBeNull()
})

it('keeps an invalid active draft intact if navigation cannot commit it', () => {
  const workbook = targetWorkbook()
  openDocumentTab(workbook)
  openDocumentTab(createDocument('Outgoing', 'outgoing'))
  useEditor.getState().startEdit('root', undefined, 'notes')
  const invalid = 'x'.repeat(100_001)
  useEditor.getState().setDraft(invalid)
  const active = useEditor.getState().workbook.id
  expect(openContentSearchResult(resultFor(workbook.id))).toBe(false)
  expect(useEditor.getState().workbook.id).toBe(active)
  expect(useEditor.getState().draft).toBe(invalid)
  expect(useTopicFocusRequest.getState().request).toBeNull()
})
