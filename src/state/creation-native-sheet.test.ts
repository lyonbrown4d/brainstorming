import { afterEach, expect, it, vi } from 'vitest'
import { applyWorkbookCommand, createDocument, type MindMapWorkbook } from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import {
  beginCreation,
  cancelCreation,
  createFromRequest,
  showWorkspaceHome,
} from '@renderer/state/creation'
import { captureDocumentSession } from '@renderer/state/documentSession'
import { switchDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { forgetNativeEditor } from '@renderer/state/nativeEditorQueue'
import { loadWorkbook } from '@renderer/state/workbookState'
import { updateCreationDraft, useWorkspace } from '@renderer/state/workspace'

const request = { title: 'New Sheet', layout: 'map', template: 'blank' } as const
let sourceId = ''
let submitted: EditorOperation | undefined
let accept: ((snapshot: NativeEditorSnapshot) => void) | undefined
let reject: ((error: Error) => void) | undefined
let original: MindMapWorkbook

const setup = (): void => {
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.getState().replace(createDocument('Original'))
  useEditor.setState({ busy: false, error: null })
  useWorkspace.setState({ screen: 'editor', hasDocument: true })
  original = useEditor.getState().workbook
  sourceId = original.id
  const source = { ...captureDocumentSession(), id: 'source-tab' }
  const other = {
    ...source,
    id: 'other-tab',
    editor: { ...source.editor, ...loadWorkbook(createDocument('Other')) },
  }
  useDocumentTabs.setState({ tabs: [source, other], activeId: source.id })
  submitted = undefined
  accept = undefined
  reject = undefined
  platform.compute = {
    openSession: () =>
      Promise.resolve({
        sessionId: sourceId,
        revision: '0',
        workbook: original,
        canUndo: false,
        canRedo: false,
      }),
    executeSession: (_id: string, _revision: string, operation: EditorOperation) => {
      submitted = operation
      return new Promise<NativeEditorSnapshot>((resolve, fail) => {
        accept = resolve
        reject = fail
      })
    },
    closeSession: () => Promise.resolve(),
  } as unknown as ComputeAPI
  expect(beginCreation('sheet')).toBe(true)
  updateCreationDraft('sheet', request)
}

const acknowledge = (): void => {
  if (submitted?.kind !== 'workbook' || !accept) throw new Error('Missing Sheet command')
  const workbook = applyWorkbookCommand(original, submitted.command)
  original = workbook
  accept({ sessionId: sourceId, revision: '1', workbook, canUndo: true, canRedo: false })
}

afterEach(() => {
  platform.compute = null
  if (sourceId) forgetNativeEditor(sourceId)
  useEditor.setState({ busy: false })
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})

it('keeps the guide and source Sheet active until the native Sheet command is acknowledged', async () => {
  setup()
  const creating = createFromRequest(request)
  await vi.waitFor(() => {
    expect(submitted?.kind).toBe('workbook')
  })
  expect(useWorkspace.getState().screen).toBe('create-sheet')
  expect(useEditor.getState().busy).toBe(true)
  expect(useEditor.getState().history.document.title).toBe('Original')
  expect(showWorkspaceHome()).toBe(false)
  cancelCreation()
  expect(useWorkspace.getState().screen).toBe('create-sheet')
  expect(switchDocumentTab('other-tab')).toBe(false)
  expect(useDocumentTabs.getState().activeId).toBe('source-tab')
  acknowledge()
  await expect(creating).resolves.toBe(true)
  expect(useEditor.getState().workbook.sheets).toHaveLength(2)
  expect(useEditor.getState().history.document.title).toBe('New Sheet')
  expect(useEditor.getState().activeSheetId).not.toBe(original.sheets[0]?.id)
  expect(useWorkspace.getState().screen).toBe('editor')
  expect(useEditor.getState().busy).toBe(false)
})

it('keeps the Sheet settings and permits retry after a native failure', async () => {
  setup()
  const creating = createFromRequest(request)
  await vi.waitFor(() => {
    expect(reject).toBeDefined()
  })
  reject?.(new Error('Native add failed'))
  await expect(creating).resolves.toBe(false)
  expect(useWorkspace.getState().screen).toBe('create-sheet')
  expect(useWorkspace.getState().creationDrafts.sheet).toEqual(request)
  expect(useEditor.getState().workbook.sheets).toHaveLength(1)
  expect(useEditor.getState().busy).toBe(false)
  submitted = undefined
  const retry = createFromRequest(request)
  await vi.waitFor(() => {
    expect(submitted?.kind).toBe('workbook')
  })
  acknowledge()
  await expect(retry).resolves.toBe(true)
  expect(useEditor.getState().history.document.title).toBe('New Sheet')
})
