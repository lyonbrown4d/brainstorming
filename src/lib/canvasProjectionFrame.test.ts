import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { applyCommand, createExampleDocument, type MindMapDocument } from '@core'
import { layoutDocument, type MindMapLayout } from '@layout'
import { createCanvasProjector } from '@renderer/lib/canvasProjection'
import {
  completeCanvasFrame,
  spatialFrameReady,
  type CanvasProjectionFrame,
} from '@renderer/lib/canvasProjectionFrame'

const clients: QueryClient[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})
const deferred = () => {
  let resolve!: (layout: MindMapLayout) => void
  const promise = new Promise<MindMapLayout>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('retains a completed frame while native geometry changes and isolates other workbooks', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const project = createCanvasProjector()
  const original = createExampleDocument()
  let document: MindMapDocument = original
  let scopeId = 'workbook-a/sheet/document'
  let frame: CanvasProjectionFrame | null = null
  const first = deferred()
  const next = deferred()
  const query = (revision: number, pending: ReturnType<typeof deferred>) => ({
    queryKey: ['geometry', scopeId, revision],
    queryFn: () => pending.promise,
    placeholderData: (previous: MindMapLayout | undefined) => previous,
  })
  const observer = new QueryObserver<MindMapLayout>(client, query(0, first))
  const unsubscribe = observer.subscribe((result) => {
    frame = completeCanvasFrame(
      frame,
      {
        scopeId,
        document,
        layout: result.data,
        placeholder: result.isPlaceholderData,
        surface: undefined,
      },
      project,
    )
  })
  const current = (): CanvasProjectionFrame => {
    if (!frame) throw new Error('missing completed canvas frame')
    return frame
  }
  first.resolve(layoutDocument(original))
  await vi.waitFor(() => {
    expect(frame).not.toBeNull()
  })
  const completed = current()
  const movedId = original.topics[original.rootId]?.children[0]
  if (!movedId) throw new Error('missing test branch')
  document = applyCommand(original, {
    type: 'setTopicStyle',
    topicId: movedId,
    style: { offsetX: 180, offsetY: 50 },
  })
  observer.setOptions(query(1, next))
  expect(observer.getCurrentResult().isPlaceholderData).toBe(true)
  expect(current().projection).toBe(completed.projection)
  expect(current().projection.nodes).toBe(completed.projection.nodes)
  next.resolve(layoutDocument(document))
  await vi.waitFor(() => {
    expect(current().projection).not.toBe(completed.projection)
  })
  const moved = current().projection.nodes.find((node) => node.id === movedId)
  expect(moved?.position).not.toEqual(
    completed.projection.nodes.find((node) => node.id === movedId)?.position,
  )
  const other = deferred()
  scopeId = 'workbook-b/sheet/document'
  document = { ...original, title: 'Other map' }
  observer.setOptions(query(0, other))
  expect(observer.getCurrentResult().isPlaceholderData).toBe(true)
  expect(frame).toBeNull()
  unsubscribe()
})

it('reconciles cached undo geometry when an intermediate layout never completes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const project = createCanvasProjector()
  const original = createExampleDocument()
  const layout = layoutDocument(original)
  let document = original
  let frame: CanvasProjectionFrame | null = null
  const pending = deferred()
  const observer = new QueryObserver<MindMapLayout>(client, {
    queryKey: ['cached-undo', 0],
    queryFn: () => Promise.resolve(layout),
    staleTime: Infinity,
  })
  const unsubscribe = observer.subscribe((result) => {
    frame = completeCanvasFrame(
      frame,
      {
        scopeId: 'book/sheet',
        document,
        layout: result.data,
        placeholder: result.isPlaceholderData,
        surface: undefined,
      },
      project,
    )
  })
  const current = (): CanvasProjectionFrame => {
    if (!frame) throw new Error('missing completed canvas frame')
    return frame
  }
  await vi.waitFor(() => {
    expect(frame).not.toBeNull()
  })
  const before = current()
  document = applyCommand(original, {
    type: 'setTopicStyle',
    topicId: original.rootId,
    style: { width: 400 },
  })
  observer.setOptions({
    queryKey: ['cached-undo', 1],
    queryFn: () => pending.promise,
    placeholderData: (previous) => previous,
  })
  expect(current().pending).toBe(true)
  expect(current().projection.nodes).toBe(before.projection.nodes)
  document = original
  observer.setOptions({
    queryKey: ['cached-undo', 0],
    queryFn: () => Promise.resolve(layout),
    staleTime: Infinity,
  })
  const restored = current()
  expect(restored.pending).toBe(false)
  expect(restored.projection.nodes).not.toBe(before.projection.nodes)
  expect(restored.projection.nodes.map((node) => node.position)).toEqual(
    before.projection.nodes.map((node) => node.position),
  )
  expect(
    completeCanvasFrame(
      restored,
      {
        scopeId: 'book/sheet',
        document,
        layout,
        placeholder: false,
        surface: undefined,
      },
      project,
    ),
  ).toBe(restored)
  pending.resolve(layout)
  await Promise.resolve()
  expect(current()).toBe(restored)
  unsubscribe()
})

it('retains the matching native depth record when base geometry is unchanged', () => {
  const document = createExampleDocument()
  const layout = layoutDocument(document)
  const project = createCanvasProjector()
  const firstDepths = { [document.rootId]: 0 }
  const first = completeCanvasFrame(
    null,
    {
      scopeId: 'book/sheet',
      document,
      layout,
      depths: firstDepths,
      placeholder: false,
      surface: undefined,
    },
    project,
  )
  const nextDepths = { [document.rootId]: 40 }
  const next = completeCanvasFrame(
    first,
    {
      scopeId: 'book/sheet',
      document,
      layout,
      depths: nextDepths,
      placeholder: false,
      surface: undefined,
    },
    project,
  )
  expect(next).not.toBe(first)
  expect(next?.projection).toBe(first?.projection)
  expect(next?.depths).toBe(nextDepths)
  expect(spatialFrameReady(next, false, false)).toBe(true)
  expect(spatialFrameReady(next, true, false)).toBe(false)
  expect(spatialFrameReady(next, false, true)).toBe(false)
  const retained = completeCanvasFrame(
    next,
    {
      scopeId: 'book/sheet',
      document,
      layout: undefined,
      placeholder: true,
      surface: undefined,
    },
    project,
  )
  expect(retained?.projection).toBe(next?.projection)
  expect(spatialFrameReady(retained, true, false)).toBe(false)
})
