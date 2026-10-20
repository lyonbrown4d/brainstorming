import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, type MindMapWorkbook } from '@core'
import type { ComputeAPI, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { loadWorkbook } from '@renderer/state/workbookState'
import { flushNativeEditor, releaseNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useWorkspace } from '@renderer/state/workspace'
import {
  closePresentationWorkspace,
  openPresentationComposer,
  selectPresentationPage,
  setPresentationMode,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'
import { startPresentationNotes } from '@renderer/state/presentationEditing'
import { commitWorkspaceNavigation } from '@renderer/routing/workspaceNavigation'

let book: MindMapWorkbook
let release: () => void
let fail: Error | undefined
const snapshot = (revision: string): NativeEditorSnapshot => ({
  sessionId: book.id,
  workbook: book,
  revision,
  canUndo: revision !== '0',
  canRedo: false,
})

beforeEach(() => {
  closePresentationWorkspace()
  usePresentation.setState(usePresentation.getInitialState(), true)
  useEditor.setState(useEditor.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useWorkspace.setState({ screen: 'editor', hasDocument: true })
  book = createWorkbook(
    applyCommand(createDocument('Root'), {
      type: 'addTopic',
      parentId: 'root',
      id: 'branch',
      title: 'Branch',
    }),
  )
  useEditor.setState(loadWorkbook(book))
  fail = undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const compute: Pick<ComputeAPI, 'openSession' | 'executeSession' | 'closeSession'> = {
    openSession: () => Promise.resolve(snapshot('0')),
    executeSession: async (_id, revision, operation) => {
      await gate
      if (fail) throw fail
      if (operation.kind !== 'topic') throw new Error('Expected topic edit')
      book = {
        ...book,
        sheets: book.sheets.map((sheet) =>
          sheet.id === operation.sheetId
            ? { ...sheet, document: applyCommand(sheet.document, operation.command) }
            : sheet,
        ),
      }
      return snapshot(String(Number(revision) + 1))
    },
    closeSession: () => Promise.resolve(),
  }
  platform.compute = compute as ComputeAPI
  openPresentationComposer()
})

afterEach(async () => {
  release()
  useEditor.getState().cancelEdit()
  closePresentationWorkspace()
  await releaseNativeEditor(book.id)
  platform.compute = null
  vi.unstubAllGlobals()
})

const finishEdits = async (): Promise<void> => {
  release()
  await flushNativeEditor(book.id)
  await Promise.resolve()
}

const rename = (): void => {
  expect(
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Renamed' }),
  ).toBe(true)
}

it('commits native speaker notes before starting and returns to the real composer after playback', async () => {
  const source = useEditor.getState()
  expect(
    startPresentationNotes({
      workbookId: source.workbook.id,
      sheetId: source.activeSheetId,
      documentId: source.history.document.id,
      pageIndex: 0,
      topicId: 'root',
    }),
  ).toBe(true)
  useEditor.getState().setDraft('Final speaker notes')
  showPresentationStep(0)
  setPresentationMode('presenter')
  expect(usePresentation.getState()).toMatchObject({ playing: false, workspaceMode: 'composer' })
  const view = { x: 42, y: 18, zoom: 0.7 }
  useEditor.setState({ views: { [source.activeSheetId]: view } })
  await finishEdits()
  expect(usePresentation.getState()).toMatchObject({ playing: true, workspaceMode: 'presenter' })
  expect(usePresentation.getState().steps[0]?.notes).toBe('Final speaker notes')
  expect(usePresentation.getState().snapshot?.history).toBe(useEditor.getState().history)
  expect(usePresentation.getState().snapshot?.view).toBe(view)
  stopPresentation()
  expect(usePresentation.getState()).toMatchObject({ playing: false, workspaceMode: 'composer' })
})

it('waits for edits already pending before playback and honors the most recent requested slide', async () => {
  rename()
  showPresentationStep(0)
  showPresentationStep(1)
  expect(usePresentation.getState().playing).toBe(false)
  await finishEdits()
  expect(usePresentation.getState()).toMatchObject({ playing: true, index: 1 })
  expect(usePresentation.getState().snapshot?.history.document.title).toBe('Renamed')
})

it.each(['stop', 'close', 'sheet', 'workbook', 'home', 'edit', 'page', 'navigation'] as const)(
  'does not start later after %s cancels the pending playback intent',
  async (reason) => {
    rename()
    showPresentationStep(0)
    const original = useEditor.getState()
    if (reason === 'stop') stopPresentation()
    if (reason === 'close') closePresentationWorkspace()
    if (reason === 'sheet') {
      useEditor.setState({ activeSheetId: 'other-sheet' })
      useEditor.setState({ activeSheetId: original.activeSheetId })
    }
    if (reason === 'workbook') useEditor.setState(loadWorkbook(createDocument('Other')))
    if (reason === 'home') useWorkspace.setState({ screen: 'home' })
    if (reason === 'edit') useEditor.setState({ editingId: 'root', draft: 'New draft' })
    if (reason === 'page') selectPresentationPage(1)
    if (reason === 'navigation') expect(commitWorkspaceNavigation()).toBe(true)
    await finishEdits()
    expect(usePresentation.getState().playing).toBe(false)
    expect(usePresentation.getState().snapshot).toBeNull()
  },
)

it.each([false, true])(
  'reports a failed commit without starting or changing another document (%s)',
  async (switchDocument) => {
    rename()
    showPresentationStep(0)
    if (switchDocument) useEditor.setState(loadWorkbook(createDocument('Other')))
    fail = new Error('Native edit failed')
    release()
    await expect(flushNativeEditor(book.id)).rejects.toThrow('Native edit failed')
    await Promise.resolve()
    expect(usePresentation.getState().playing).toBe(false)
    expect(useEditor.getState().error).toBe(switchDocument ? null : 'Native edit failed')
  },
)

it('cancels playback when navigation leaves and returns to the same hash before the acknowledgment', async () => {
  const browser = Object.assign(new EventTarget(), { location: { hash: '#/presentation' } })
  vi.stubGlobal('window', browser)
  rename()
  showPresentationStep(0)
  browser.location.hash = '#/settings'
  browser.dispatchEvent(new Event('hashchange'))
  browser.location.hash = '#/presentation'
  browser.dispatchEvent(new Event('popstate'))
  await finishEdits()
  expect(usePresentation.getState().playing).toBe(false)
  expect(usePresentation.getState().snapshot).toBeNull()
})
