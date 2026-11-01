import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  applyCommand,
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  type MindMapWorkbook,
} from '@core'
import type { ComputeAPI, EditorOperation, NativeEditorSnapshot } from '@shared/compute'

const platform = vi.hoisted(() => ({ compute: null as ComputeAPI | null }))
vi.mock('@renderer/lib/desktop', () => ({ getPlatformAPI: () => ({ compute: platform.compute }) }))

import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { setSelectedTopics } from '@renderer/state/selection'
import { flushNativeEditor, forgetNativeEditor } from '@renderer/state/nativeEditorQueue'
import {
  applyTopicStyle,
  copyTopicStyle,
  useCopiedTopicStyle,
} from '@renderer/state/topicStyleActions'

interface PendingOperation {
  operation: EditorOperation
  resolve: (snapshot: NativeEditorSnapshot) => void
  reject: (error: Error) => void
}
let workbook: MindMapWorkbook
let workbookId = ''
let revision = 0
let pending: PendingOperation[] = []
let operations: EditorOperation[] = []

beforeEach(() => {
  platform.compute = null
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  let document = createDocument('Styles')
  for (const [id, parentId] of [
    ['a', 'root'],
    ['b', 'root'],
    ['a1', 'a'],
  ]) {
    if (!id || !parentId) throw new Error('Invalid fixture')
    document = applyCommand(document, { type: 'addTopic', parentId, id, title: id })
  }
  workbook = applyWorkbookCommand(createWorkbook(document), {
    type: 'addSheet',
    sheet: { id: 'other', name: 'Other', document: createDocument('Other') },
  })
  useEditor.getState().replace(workbook)
  useEditor.setState({ busy: false, editingId: null, error: null })
  setSelectedTopics(['a'])
  useCopiedTopicStyle.setState({ style: { width: 111 } })
  workbookId = workbook.id
  revision = 0
  pending = []
  operations = []
  platform.compute = {
    openSession: () =>
      Promise.resolve({
        sessionId: workbookId,
        revision: '0',
        workbook,
        canUndo: false,
        canRedo: false,
      }),
    executeSession: (_id: string, _revision: string, operation: EditorOperation) => {
      operations.push(operation)
      return new Promise<NativeEditorSnapshot>((resolve, reject) => {
        pending.push({ operation, resolve, reject })
      })
    },
    closeSession: () => Promise.resolve(),
  } as unknown as ComputeAPI
})

afterEach(() => {
  platform.compute = null
  forgetNativeEditor(workbookId)
  useEditor.setState({ busy: false, editingId: null })
})

const acknowledge = async (): Promise<void> => {
  await vi.waitFor(() => {
    expect(pending).toHaveLength(1)
  })
  const next = pending.shift()
  if (next?.operation.kind !== 'topic') throw new Error('Missing topic operation')
  const operation = next.operation
  workbook = {
    ...workbook,
    sheets: workbook.sheets.map((sheet) =>
      sheet.id === operation.sheetId
        ? { ...sheet, document: applyCommand(sheet.document, operation.command) }
        : sheet,
    ),
  }
  revision += 1
  next.resolve({
    sessionId: workbookId,
    revision: String(revision),
    workbook,
    canUndo: true,
    canRedo: false,
  })
}

const changeWidth = (): void => {
  useEditor.getState().command({ type: 'setTopicStyle', topicId: 'a', style: { width: 360 } })
}

it('waits for the width acknowledgment and a pending copy before pasting instead of using the old clipboard', async () => {
  changeWidth()
  copyTopicStyle()
  setSelectedTopics(['b'])
  expect(applyTopicStyle('selection')).toBe(true)
  expect(useCopiedTopicStyle.getState().style?.width).toBe(111)
  await acknowledge()
  await vi.waitFor(() => {
    expect(pending).toHaveLength(1)
  })
  expect(useCopiedTopicStyle.getState().style?.width).toBe(360)
  expect(operations[1]).toMatchObject({
    kind: 'topic',
    command: {
      type: 'batch',
      commands: [{ type: 'setTopicStyle', topicId: 'b', style: { width: 360 } }],
    },
  })
  await acknowledge()
  await flushNativeEditor(workbookId)
  expect(useEditor.getState().history.document.topics.b?.style?.width).toBe(360)
})

it.each(['level', 'descendants'] as const)(
  'reads acknowledged source style and target position for %s',
  async (scope) => {
    const targetId = scope === 'level' ? 'b' : 'a1'
    useEditor.getState().command({
      type: 'batch',
      commands: [
        {
          type: 'setTopicStyle',
          topicId: 'a',
          style: { width: 320, offsetX: 99, spatialDepth: 50 },
        },
        {
          type: 'setTopicStyle',
          topicId: targetId,
          style: { offsetX: 77, offsetY: -12, spatialDepth: -8 },
        },
      ],
    })
    expect(applyTopicStyle(scope)).toBe(true)
    await acknowledge()
    await vi.waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    expect(operations[1]).toMatchObject({
      kind: 'topic',
      command: {
        type: 'batch',
        commands: [
          {
            type: 'setTopicStyle',
            topicId: targetId,
            style: { width: 320, offsetX: 77, offsetY: -12, spatialDepth: -8 },
          },
        ],
      },
    })
    await acknowledge()
    await flushNativeEditor(workbookId)
    expect(useEditor.getState().history.document.topics[targetId]?.style).toMatchObject({
      width: 320,
      offsetX: 77,
      offsetY: -12,
      spatialDepth: -8,
    })
  },
)

it.each(['selection', 'sheet', 'workbook'] as const)(
  'cancels a waiting application after changing %s even when returning',
  async (change) => {
    changeWidth()
    expect(applyTopicStyle('level')).toBe(true)
    const original = useEditor.getState()
    if (change === 'selection') {
      setSelectedTopics(['b'])
      setSelectedTopics(['a'])
    } else if (change === 'sheet') {
      useEditor.setState({ activeSheetId: 'other' })
      useEditor.setState({ activeSheetId: original.activeSheetId })
    } else {
      useEditor.setState({ workbook: createWorkbook(createDocument('Another')) })
      useEditor.setState({ workbook: original.workbook })
    }
    await acknowledge()
    await flushNativeEditor(workbookId)
    expect(operations).toHaveLength(1)
    expect(useEditor.getState().history.document.topics.b?.style?.width).toBeUndefined()
  },
)

it('cancels copying and the dependent paste after leaving the source workbook', async () => {
  changeWidth()
  copyTopicStyle()
  setSelectedTopics(['b'])
  expect(applyTopicStyle('selection')).toBe(true)
  useEditor.getState().replace(createDocument('Another'))
  const other = useEditor.getState().history.document
  await acknowledge()
  await flushNativeEditor(workbookId)
  expect(operations).toHaveLength(1)
  expect(useCopiedTopicStyle.getState().style?.width).toBe(111)
  expect(useEditor.getState().history.document).toBe(other)
})

it('does not paste an old clipboard when the pending copy fails', async () => {
  changeWidth()
  copyTopicStyle()
  setSelectedTopics(['b'])
  expect(applyTopicStyle('selection')).toBe(true)
  await vi.waitFor(() => {
    expect(pending).toHaveLength(1)
  })
  pending.shift()?.reject(new Error('Width command failed'))
  await expect(flushNativeEditor(workbookId)).rejects.toThrow('Width command failed')
  await vi.waitFor(() => {
    expect(useEditor.getState().error).toBe('Width command failed')
  })
  expect(operations).toHaveLength(1)
  expect(useEditor.getState().history.document.topics.b?.style?.width).toBeUndefined()
})
