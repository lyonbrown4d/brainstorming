import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook } from '@core'
import type { DesktopWindowsAPI, TransferredDocument } from '@shared/windows'
import { desktop } from '@tests/fixtures/desktop'
import { useEditor, editorIsDirty } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import {
  isSwitchingDocument,
  openDocumentTab,
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { saveDocument } from '@renderer/state/files'
import { moveDocumentToWindow, receiveTransferredDocuments } from '@renderer/state/windowTransfers'
import { useSelection } from '@renderer/state/selection'
import { getSpatialViewport, setSpatialViewport } from '@renderer/state/spatialViewports'
import { setSpatialLens, spatialLensKey, useSpatialLens } from '@renderer/state/spatialLens'

let incoming: TransferredDocument | null = null
let stopSynchronizing: (() => void) | undefined
const move = vi.fn<DesktopWindowsAPI['moveDocument']>()
const acknowledge = vi.fn(() => {
  incoming = null
  return Promise.resolve()
})
const windows: DesktopWindowsAPI = {
  newWindow: () => Promise.resolve('editor-second'),
  openDocumentInNewWindow: () => Promise.resolve(),
  listWindows: () => Promise.resolve([]),
  focusWindow: () => Promise.resolve(),
  moveDocument: move,
  takeTransferredDocument: () => Promise.resolve(incoming),
  acknowledgeTransfer: acknowledge,
  onDocumentTransfer: () => () => undefined,
  onFocusDocument: () => () => undefined,
  syncMenuState: () => Promise.resolve(),
}
beforeEach(() => {
  incoming = null
  move.mockReset()
  acknowledge.mockClear()
  desktop({ windows })
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  // Keep the production file lifecycle's synchronous editor-to-tab subscription active.
  stopSynchronizing = useEditor.subscribe((state, previous) => {
    if (isSwitchingDocument()) return
    if (
      state.busy !== previous.busy ||
      state.workbook !== previous.workbook ||
      state.draft !== previous.draft ||
      state.richDraft !== previous.richDraft ||
      state.editingId !== previous.editingId ||
      state.editingSurface !== previous.editingSurface ||
      state.activeSheetId !== previous.activeSheetId ||
      state.baseline !== previous.baseline ||
      state.path !== previous.path
    )
      synchronizeDocumentTab()
  })
})
afterEach(() => stopSynchronizing?.())
it('moves an unsaved tab without losing undo, selection, Sheet viewport or camera distance', async () => {
  const workbook = createWorkbook(createDocument('Before', 'transfer-sheet'), 'Transfer')
  openDocumentTab(workbook)
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Unsaved title' })
  useEditor.setState({ views: { 'transfer-sheet': { x: 12, y: 24, zoom: 1.4 } } })
  useSelection.setState({ sheets: { 'transfer-sheet': ['root'] } })
  setSpatialViewport(workbook.id, 'transfer-sheet', '3d', { x: 30, y: 60, zoom: 0.8 })
  setSpatialLens(workbook.id, 'transfer-sheet', 1500)
  move.mockImplementation((session) => {
    incoming = { token: 'accepted-token', session }
    return Promise.resolve({ windowId: 'editor-second' })
  })
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Expected a document tab')
  await moveDocumentToWindow(id, 'editor-second')
  expect(move).toHaveBeenCalledWith(expect.any(String), 'editor-second')
  expect(useDocumentTabs.getState().tabs).toHaveLength(0)
  expect(useWorkspace.getState().hasDocument).toBe(false)
  useEditor.setState(useEditor.getInitialState(), true)
  await receiveTransferredDocuments()
  expect(acknowledge).toHaveBeenCalledWith('accepted-token')
  expect(useEditor.getState().history.document.title).toBe('Unsaved title')
  expect(useEditor.getState().path).toBeNull()
  expect(editorIsDirty(useEditor.getState())).toBe(true)
  expect(useSelection.getState().sheets['transfer-sheet']).toEqual(['root'])
  expect(useEditor.getState().views['transfer-sheet']).toEqual({ x: 12, y: 24, zoom: 1.4 })
  expect(getSpatialViewport(workbook.id, 'transfer-sheet', '3d')).toEqual({
    x: 30,
    y: 60,
    zoom: 0.8,
  })
  expect(useSpatialLens.getState().distances[spatialLensKey(workbook.id, 'transfer-sheet')]).toBe(
    1500,
  )
  useEditor.getState().undo()
  expect(useEditor.getState().history.document.title).toBe('Before')
})
it('keeps the original tab and dirty content when native transfer fails', async () => {
  openDocumentTab(createDocument('Kept'))
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Keep edit' })
  move.mockRejectedValue(new Error('目标窗口已关闭'))
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Expected a document tab')
  await expect(moveDocumentToWindow(id, 'editor-second')).rejects.toThrow('目标窗口已关闭')
  expect(useDocumentTabs.getState().activeId).toBe(id)
  expect(useEditor.getState().history.document.title).toBe('Keep edit')
  expect(useEditor.getState().busy).toBe(false)
  expect(acknowledge).not.toHaveBeenCalled()
})

it('keeps the source tab attached and busy until native target acceptance completes', async () => {
  openDocumentTab(createDocument('Pending source'))
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Expected a source tab')
  let accept: ((result: { windowId: string }) => void) | undefined
  move.mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve
      }),
  )
  const moving = moveDocumentToWindow(id, 'editor-second')
  await vi.waitFor(() => {
    expect(move).toHaveBeenCalled()
  })
  expect(useDocumentTabs.getState().activeId).toBe(id)
  expect(useEditor.getState().busy).toBe(true)
  if (!accept) throw new Error('Expected a pending native acknowledgement')
  accept({ windowId: 'editor-second' })
  await moving
  expect(useDocumentTabs.getState().tabs).toHaveLength(0)
  expect(useEditor.getState().busy).toBe(false)
})

it('restores the target workspace if native acknowledgement rejects the staged tab', async () => {
  openDocumentTab(createDocument('Incoming'))
  move.mockImplementation((session) => {
    incoming = { token: 'expired', session }
    return Promise.resolve({ windowId: 'editor-second' })
  })
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Expected a source tab')
  await moveDocumentToWindow(id, 'editor-second')
  const target = createDocument('Target kept')
  openDocumentTab(target, '/target-kept.brainstorming')
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Target edit' })
  const previousId = useDocumentTabs.getState().activeId
  const observedTabs: string[][] = []
  const stopObserving = useDocumentTabs.subscribe((state) => {
    if (!isSwitchingDocument()) observedTabs.push(state.tabs.map((tab) => tab.editor.workbook.id))
  })
  acknowledge.mockRejectedValueOnce(new Error('导图移交请求已失效'))
  try {
    await expect(receiveTransferredDocuments()).rejects.toThrow('导图移交请求已失效')
  } finally {
    stopObserving()
  }
  expect(observedTabs.length).toBeGreaterThan(0)
  expect(observedTabs.every((ids) => ids.length === 1 && ids[0] === target.id)).toBe(true)
  expect(useDocumentTabs.getState().activeId).toBe(previousId)
  expect(useDocumentTabs.getState().tabs).toHaveLength(1)
  expect(useEditor.getState().history.document.title).toBe('Target edit')
  expect(useEditor.getState().path).toBe('/target-kept.brainstorming')
  expect(editorIsDirty(useEditor.getState())).toBe(true)
  expect(useEditor.getState().busy).toBe(false)
  useEditor.getState().undo()
  expect(useEditor.getState().history.document.title).toBe('Target kept')
})

it('receives and saves into an occupied window without overwriting its saved tab', async () => {
  const source = createWorkbook(createDocument('Source original', 'source-sheet'), 'Source')
  openDocumentTab(source)
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Source edited' })
  move.mockImplementation((session) => {
    incoming = { token: 'occupied-target', session }
    return Promise.resolve({ windowId: 'editor-second' })
  })
  const sourceId = useDocumentTabs.getState().activeId
  if (!sourceId) throw new Error('Expected source tab')
  await moveDocumentToWindow(sourceId, 'editor-second')
  const target = createWorkbook(createDocument('Target saved', 'target-sheet'), 'Target')
  openDocumentTab(target, '/target.brainstorming')
  const targetId = useDocumentTabs.getState().activeId
  if (!targetId) throw new Error('Expected target tab')
  const save = vi.fn(() => Promise.resolve('/source.brainstorming'))
  desktop({ windows, saveDocument: save })
  await receiveTransferredDocuments()
  const receivedId = useDocumentTabs.getState().activeId
  expect(receivedId).not.toBe(targetId)
  expect(useDocumentTabs.getState().tabs.map((tab) => tab.editor.workbook.id)).toEqual([
    target.id,
    source.id,
  ])
  expect(useEditor.getState().path).toBeNull()
  useEditor.getState().undo()
  expect(useEditor.getState().history.document.title).toBe('Source original')
  await saveDocument()
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ path: null, openDocumentIds: [target.id, source.id] }),
  )
  expect(useEditor.getState().path).toBe('/source.brainstorming')
  expect(switchDocumentTab(targetId)).toBe(true)
  expect(useEditor.getState().history.document.title).toBe('Target saved')
  expect(useEditor.getState().path).toBe('/target.brainstorming')
  expect(editorIsDirty(useEditor.getState())).toBe(false)
  if (!receivedId) throw new Error('Expected received tab')
  expect(switchDocumentTab(receivedId)).toBe(true)
  expect(useEditor.getState().path).toBe('/source.brainstorming')
  useEditor.getState().redo()
  expect(useEditor.getState().history.document.title).toBe('Source edited')
})
