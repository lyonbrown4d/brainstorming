import { describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  independentSpatialClickSelection,
  independentSpatialMove,
  independentSpatialStartDrag,
  type IndependentSpatialPointerSession,
} from '@renderer/lib/independentSpatialGestureSession'

const fixture = () => {
  const document = applyCommand(createDocument('Gesture threshold'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'branch',
    title: 'Branch',
  })
  const runtime = createIndependentSpatialRuntime({
    document,
    layout: {
      nodes: [
        { id: 'root', x: 0, y: 0, width: 100, height: 40, side: 'right' },
        { id: 'branch', x: 150, y: 0, width: 100, height: 40, side: 'right' },
      ],
      edges: [],
    },
    depths: {},
    surface: '#fff',
  })
  const rect = {
    id: 'branch',
    kind: 'topic' as const,
    x: 150,
    y: 0,
    width: 100,
    height: 40,
    depth: 1,
  }
  const rectangles = vi.spyOn(runtime, 'rectangles').mockReturnValue([rect])
  const active: IndependentSpatialPointerSession = {
    pointer: 1,
    start: { x: 160, y: 10 },
    document,
    workbook: 'workbook',
    sheet: 'sheet',
    view: { mode: '3d', yaw: 0, pitch: 0, spacing: 100 },
    rectangles: [],
    topics: [],
    drawings: [],
    movingTopics: ['branch'],
    movingDrawings: [],
    move: null,
    plane: null,
    anchor: { x: 160, y: 10, z: 0 },
    rect,
    find: null,
    token: null,
    dragged: false,
    singlePick: true,
  }
  return { runtime, active, rectangles }
}

describe('deferred independent spatial drag snapshot', () => {
  it('keeps click selection available without a drag snapshot, then initializes only once', () => {
    const { runtime, active, rectangles } = fixture()
    const start = active.start,
      anchor = active.anchor,
      rect = active.rect
    expect(independentSpatialClickSelection(active)).toEqual({ topics: ['branch'], drawings: [] })
    expect(rectangles).not.toHaveBeenCalled()
    expect(active.move).toBeNull()
    independentSpatialStartDrag(runtime, active)
    expect(active.move?.roots).toEqual(['branch'])
    expect(active.find).not.toBeNull()
    expect(active.start).toBe(start)
    expect(active.anchor).toBe(anchor)
    expect(active.rect).toBe(rect)
    expect(independentSpatialClickSelection(active)).toBeNull()
    independentSpatialStartDrag(runtime, active)
    expect(rectangles).toHaveBeenCalledTimes(1)
  })

  it('captures blank marquee rectangles without creating a topic move or drop finder', () => {
    const { runtime, active } = fixture()
    active.rect = null
    active.singlePick = false
    active.topics = ['root']
    independentSpatialStartDrag(runtime, active)
    expect(active.move).toBeNull()
    expect(active.find).toBeNull()
    expect(active.rectangles.map((rect) => rect.id)).toEqual(['branch'])
    expect(active.topics).toEqual(['root'])
    expect(independentSpatialClickSelection(active)).toBeNull()
  })

  it('publishes nothing when cancelling an unpreviewed move and restores owned prior offsets once', () => {
    const { runtime } = fixture()
    const previous = { x: 5, y: 6, z: 7 }
    runtime.offsets.set('branch', previous)
    const notify = vi.fn()
    runtime.subscribe(notify)
    const click = independentSpatialMove(runtime, ['branch'], [])
    click.cancel()
    expect(notify).not.toHaveBeenCalled()
    expect(runtime.offsets.get('branch')).toBe(previous)
    const drag = independentSpatialMove(runtime, ['branch'], [])
    drag.preview({ x: 10, y: 20, z: 30 })
    notify.mockClear()
    drag.cancel()
    drag.cancel()
    expect(runtime.offsets.get('branch')).toBe(previous)
    expect(notify).toHaveBeenCalledExactlyOnceWith('preview')
    expect(drag.finish()).toBeUndefined()
  })

  it('leaves a newer preview owner intact when an older drag is cancelled', () => {
    const { runtime } = fixture()
    const drag = independentSpatialMove(runtime, ['branch'], [])
    drag.preview({ x: 10, y: 20, z: 30 })
    const replacement = { x: 40, y: 50, z: 60 }
    runtime.offsets.set('branch', replacement)
    const notify = vi.fn()
    runtime.subscribe(notify)
    drag.cancel()
    expect(runtime.offsets.get('branch')).toBe(replacement)
    expect(notify).not.toHaveBeenCalled()
  })
})
