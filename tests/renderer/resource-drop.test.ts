import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset } from '@assets'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { attachDroppedAssets, importDroppedFiles } from '@renderer/hooks/useFileDrop'
import { previewQueueUrls, workbookPreviewUrls } from '@renderer/hooks/useLinkPreviewQueue'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { desktop } from '@tests/fixtures/desktop'
import { imageBase64 } from '@tests/fixtures/content'

beforeEach(() => {
  vi.stubGlobal('window', { brainstorming: desktop() })
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.getState().replace(createWorkbook(createDocument('Drop target')))
})
afterEach(() => {
  vi.unstubAllGlobals()
})
const target = () => {
  const state = useEditor.getState()
  return { workbookId: state.workbook.id, sheetId: state.activeSheetId, topicId: 'root' }
}

describe('dropped resources', () => {
  it('adds multiple resource types in one undo step without losing a second image', () => {
    const image = createAsset(Buffer.from(imageBase64, 'base64'), 'first.png', 'first')
    const second = createAsset(Buffer.from(imageBase64, 'base64'), 'second.png', 'second')
    const file = createAsset(new Uint8Array([1, 2]), 'notes.bin', 'notes')
    attachDroppedAssets([image, second, file], target())
    const document = useEditor.getState().history.document
    expect(document.topics.root?.image?.assetId).toBe('first')
    expect(document.topics.root?.attachments).toEqual(['second', 'notes'])
    expect(useEditor.getState().history.past).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.root?.image).toBeUndefined()
    expect(useEditor.getState().history.document.topics.root?.attachments).toBeUndefined()
  })

  it('rejects stale and absent target contexts without changing the document', () => {
    const file = createAsset(new Uint8Array([1]), 'notes.bin', 'notes')
    const before = useEditor.getState().history
    expect(() => {
      attachDroppedAssets([file], { ...target(), workbookId: 'previous' })
    }).toThrow()
    expect(() => {
      attachDroppedAssets([file], null)
    }).toThrow()
    expect(useEditor.getState().history).toBe(before)
  })

  it('opens mixed drops from home, reuses duplicate paths and attaches resources to the opened map', async () => {
    useWorkspace.setState(useWorkspace.getInitialState(), true)
    const workbook = createWorkbook(createDocument('Dropped map'))
    const document = { path: '/dropped.brainstorming', contents: serializeWorkbook(workbook) }
    vi.stubGlobal('window', {
      brainstorming: desktop({
        importDroppedFiles: () =>
          Promise.resolve({
            documents: [document, document],
            assets: [createAsset(new Uint8Array([1]), 'notes.bin', 'dropped-notes')],
          }),
      }),
    })
    await importDroppedFiles([], null)
    expect(useDocumentTabs.getState().tabs).toHaveLength(1)
    expect(useEditor.getState().path).toBe('/dropped.brainstorming')
    expect(useEditor.getState().workbook.title).toBe('Dropped map')
    expect(useEditor.getState().history.document.topics.root?.attachments).toEqual([
      'dropped-notes',
    ])
    expect(useEditor.getState().busy).toBe(false)
  })

  it('clears the busy state after an import failure and preserves the target', async () => {
    vi.stubGlobal('window', {
      brainstorming: desktop({
        importDroppedFiles: () => Promise.reject(new Error('Cannot read file')),
      }),
    })
    const before = useEditor.getState().history
    await expect(importDroppedFiles([], target())).rejects.toThrow('Cannot read file')
    expect(useEditor.getState().busy).toBe(false)
    expect(useEditor.getState().history).toBe(before)
  })
})

describe('background link preview discovery', () => {
  it('filters invalid and credential-bearing URLs without poisoning valid queue members', () => {
    expect(
      previewQueueUrls([
        'bad URL',
        'https://user:secret@example.com/',
        'mailto:user@example.com',
        'https://example.com#one',
        'https://example.com/#two',
        'https://other.example/path',
      ]),
    ).toEqual(['https://example.com/', 'https://other.example/path'])
    expect(previewQueueUrls(['https://user:secret@example.com/'])).toEqual([])
  })

  it('submits at most 1000 unique normalized URLs and preserves an empty reconciliation set', () => {
    const input = Array.from({ length: 1200 }, (_, index) => `https://example.com/${index}`)
    const expected = [...input].sort().slice(0, 1000)
    expect(previewQueueUrls([...input, ...input])).toEqual(expected)
    expect(previewQueueUrls([])).toEqual([])
  })

  it('deduplicates website links across topics and ignores internal, mail and unsafe links', () => {
    const workbook = createWorkbook(createDocument('URLs'))
    const sheet = workbook.sheets[0]
    if (!sheet) throw new Error('Missing sheet')
    const document = {
      ...sheet.document,
      topics: {
        ...sheet.document.topics,
        one: {
          id: 'one',
          title: 'one',
          collapsed: false,
          side: 'right' as const,
          children: [],
          metadata: { link: { kind: 'url' as const, url: 'https://example.com' } },
        },
        two: {
          id: 'two',
          title: 'two',
          collapsed: false,
          side: 'right' as const,
          children: [],
          metadata: { link: { kind: 'url' as const, url: 'https://example.com' } },
        },
        email: {
          id: 'email',
          title: 'mail',
          collapsed: false,
          side: 'right' as const,
          children: [],
          metadata: { link: { kind: 'url' as const, url: 'mailto:test@example.com' } },
        },
        local: {
          id: 'local',
          title: 'file',
          collapsed: false,
          side: 'right' as const,
          children: [],
          metadata: { link: { kind: 'url' as const, url: 'file:///etc/passwd' } },
        },
      },
    }
    expect(workbookPreviewUrls({ ...workbook, sheets: [{ ...sheet, document }] })).toEqual([
      'https://example.com/',
    ])
  })
})
