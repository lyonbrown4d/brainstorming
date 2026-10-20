import { afterEach, expect, it, vi } from 'vitest'
import type { MindMapWorkbook, Topic } from '@core'
import type { ComputeAPI, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({
  getPlatformAPI: () => ({ compute: platform.compute }),
  requireDesktopAPI: () => ({}),
}))

import { openTopicLink } from '@renderer/components/metadata/LinkPanel'
import { useEditor } from '@renderer/state/editor'
import { loadWorkbook } from '@renderer/state/workbookState'
import { flushNativeEditor, forgetNativeEditor } from '@renderer/state/nativeEditorQueue'
import { useDocumentTabs } from '@renderer/state/documentTabs'

const workbook = (): MindMapWorkbook => ({
  format: 'brainstorming',
  version: 2,
  id: 'link-book',
  title: 'Map',
  sheets: ['a', 'b'].map((id) => ({
    id,
    name: id,
    document: {
      format: 'brainstorming',
      version: 1,
      id,
      title: id,
      rootId: id,
      topics: {
        [id]: {
          id,
          title: id,
          children: id === 'b' ? ['leaf'] : [],
          collapsed: id === 'b',
          side: 'right',
        },
        ...(id === 'b'
          ? {
              leaf: {
                id: 'leaf',
                title: 'Leaf',
                children: [],
                collapsed: false,
                side: 'right' as const,
              },
            }
          : {}),
      },
    },
  })),
})
const editRoot = (
  book: MindMapWorkbook,
  sheetId: string,
  patch: Partial<Topic>,
): MindMapWorkbook => ({
  ...book,
  sheets: book.sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet
    const root = sheet.document.topics[sheet.document.rootId]
    if (!root) throw new Error('missing test root')
    return {
      ...sheet,
      document: {
        ...sheet.document,
        title: patch.title ?? sheet.document.title,
        topics: { ...sheet.document.topics, [root.id]: { ...root, ...patch } },
      },
    }
  }),
})
const snapshot = (book: MindMapWorkbook, revision: string): NativeEditorSnapshot => ({
  sessionId: book.id,
  revision,
  workbook: book,
  canUndo: revision !== '0',
  canRedo: false,
})
const deferred = () => {
  let resolve!: (value: NativeEditorSnapshot) => void
  const promise = new Promise<NativeEditorSnapshot>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  platform.compute = null
  forgetNativeEditor('link-book')
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
})

it('waits for draft and collapsed-branch acknowledgments before following a cross-sheet link', async () => {
  const book = workbook()
  const draft = deferred()
  const expanded = deferred()
  const execute = vi.fn().mockReturnValueOnce(draft.promise).mockReturnValueOnce(expanded.promise)
  platform.compute = {
    openSession: () => Promise.resolve(snapshot(book, '0')),
    executeSession: execute,
    closeSession: () => Promise.resolve(),
  } as unknown as ComputeAPI
  useEditor.setState({ ...loadWorkbook(book), editingId: null, error: null })
  useEditor.getState().startEdit('a')
  useEditor.getState().setDraft('Edited')
  openTopicLink({ kind: 'topic', sheetId: 'b', topicId: 'leaf' })
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(1)
  })
  expect(useEditor.getState().activeSheetId).toBe('a')
  const committed = editRoot(book, 'a', { title: 'Edited' })
  draft.resolve(snapshot(committed, '1'))
  await vi.waitFor(() => {
    expect(execute).toHaveBeenCalledTimes(2)
  })
  expect(useEditor.getState().activeSheetId).toBe('b')
  expect(useEditor.getState().selectedId).toBe('b')
  expanded.resolve(snapshot(editRoot(committed, 'b', { collapsed: false }), '2'))
  await flushNativeEditor(book.id)
  expect(useEditor.getState().selectedId).toBe('leaf')
  expect(useEditor.getState().history.document.topics.b?.collapsed).toBe(false)
  expect(useEditor.getState().error).toBeNull()
})
