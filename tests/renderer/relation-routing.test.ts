import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  executeCommand,
  undo,
  redo,
  serializeDocument,
  deserializeDocument,
  createTopicClipboard,
  validateTopicClipboard,
} from '@core'
import type { Relation } from '@core'
import { validateRelation } from '@core/annotation-validation'
import {
  relationGeometry,
  relationLayoutGeometry,
  resetRelationGeometry,
} from '@shared/relation-geometry'
import { renderSheetSvg } from '@renderer/export/svg'

const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error('Missing test fixture value')
  return value
}
const relation: Relation = {
  id: 'r',
  from: 'a',
  to: 'b',
  routing: 'curve',
  sourceAnchor: 'right',
  targetAnchor: 'left',
  controlPoints: [
    { x: -20, y: -180 },
    { x: 60, y: 180 },
  ],
  labelOffset: { x: 120, y: -400 },
}
const fixture = () =>
  applyCommand(createDocument('关系'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', id: 'a', parentId: 'root', title: 'A' },
      { type: 'addTopic', id: 'b', parentId: 'root', title: 'B' },
      { type: 'upsertRelation', relation },
    ],
  })

describe('serializable relation routing', () => {
  it('retains tree ownership through history, serialization and clipboard', () => {
    const document = fixture(),
      topics = document.topics
    const changed = { ...relation, routing: 'orthogonal' as const, waypoints: [{ x: 10, y: 80 }] }
    const history = executeCommand(createHistory(document), {
      type: 'upsertRelation',
      relation: changed,
    })
    expect(history.past).toHaveLength(1)
    expect(history.document.topics).toBe(topics)
    expect(undo(history).document.relations).toEqual([relation])
    expect(redo(undo(history)).document.relations).toEqual([changed])
    expect(deserializeDocument(serializeDocument(history.document)).relations).toEqual([changed])
    const clipboard = createTopicClipboard(history.document, ['a', 'b'])
    validateTopicClipboard(clipboard)
    expect(clipboard.relations).toEqual([changed])
    const pasted = applyCommand(document, {
      type: 'pasteTopics',
      parentId: 'root',
      clipboard,
      topicIds: { a: 'copy-a', b: 'copy-b' },
      assetIds: {},
      annotationIds: { r: 'copy-r' },
    })
    expect(pasted.relations?.find((entry) => entry.id === 'copy-r')).toEqual({
      ...changed,
      id: 'copy-r',
      from: 'copy-a',
      to: 'copy-b',
    })
    expect(() => {
      validateTopicClipboard({
        ...clipboard,
        relations: [{ ...changed, waypoints: [{ x: Infinity, y: 0 }] }],
      })
    }).toThrow()
  })
  it('rejects invalid routes, control counts, coordinates and raw view fields', () => {
    for (const patch of [
      { routing: 'diagonal' },
      { sourceAnchor: 'center' },
      { controlPoints: [] },
      { controlPoints: [{ x: 0, y: 0 }] },
      { waypoints: [] },
      { waypoints: Array.from({ length: 33 }, () => ({ x: 0, y: 0 })) },
      { labelOffset: { x: NaN, y: 0 } },
      { labelOffset: { x: 1_000_001, y: 0 } },
      { labelOffset: { x: 0, y: 0, selected: true } },
      { selected: true },
    ])
      expect(() => {
        validateRelation({ ...relation, ...patch })
      }).toThrow()
    expect(() => {
      validateRelation({ id: 'r', from: 'a', to: 'b' })
    }).not.toThrow()
  })
  it('translates controls and labels with endpoints and keeps every bend orthogonal', () => {
    const geometry = relationGeometry(relation, { x: 0, y: 0 }, { x: 300, y: 120 })
    const moved = relationGeometry(relation, { x: 40, y: -20 }, { x: 340, y: 100 })
    expect(moved.controls[0]).toEqual({
      x: required(geometry.controls[0]).x + 40,
      y: required(geometry.controls[0]).y - 20,
    })
    expect(moved.label).toEqual({ x: geometry.label.x + 40, y: geometry.label.y - 20 })
    const orthogonal = relationGeometry(
      {
        ...relation,
        routing: 'orthogonal',
        waypoints: [
          { x: 80, y: -100 },
          { x: -30, y: 60 },
        ],
      },
      { x: 0, y: 0 },
      { x: 300, y: 120 },
    )
    const numbers = required(orthogonal.path.match(/-?\d+(?:\.\d+)?/gu)).map(Number)
    const points = Array.from({ length: numbers.length / 2 }, (_, i) => ({
      x: numbers[i * 2],
      y: numbers[i * 2 + 1],
    }))
    points.slice(1).forEach((point, i) => {
      expect(point.x === points[i]?.x || point.y === points[i]?.y).toBe(true)
    })
    expect(resetRelationGeometry(relation)).toEqual({
      id: 'r',
      from: 'a',
      to: 'b',
      routing: 'curve',
    })
  })
  it('preserves React Flow automatic curve geometry when taking manual control', () => {
    for (const sourceAnchor of ['left', 'right', 'top', 'bottom'] as const) {
      const start = { x: 80, y: 90 },
        end = { x: -120, y: 260 }
      const automatic = relationGeometry(
        { id: 'auto', from: 'a', to: 'b', sourceAnchor },
        start,
        end,
      )
      const manual = relationGeometry(
        {
          id: 'auto',
          from: 'a',
          to: 'b',
          sourceAnchor,
          controlPoints: automatic.controls.map(automatic.relative),
        },
        start,
        end,
      )
      const numbers = (path: string) => path.match(/-?\d+(?:\.\d+)?/gu)?.map(Number)
      const expected = required(numbers(automatic.path))
      required(numbers(manual.path)).forEach((value, index) => {
        expect(value).toBeCloseTo(required(expected[index]), 8)
      })
      expect(manual.label.x).toBeCloseTo(automatic.label.x, 8)
      expect(manual.label.y).toBeCloseTo(automatic.label.y, 8)
    }
  })
  it('uses identical anchor geometry in export and expands bounds for displaced labels', () => {
    const geometry = relationLayoutGeometry(
      { ...relation, sourceAnchor: 'bottom', targetAnchor: 'top' },
      { x: 0, y: 0, width: 120, height: 60 },
      { x: 400, y: 200, width: 100, height: 60 },
    )
    expect(geometry.path).toMatch(/^M 60 60 C/u)
    const svg = renderSheetSvg(fixture()).svg
    expect(svg).toContain('export-arrow-0')
    const viewBox = required(required(/viewBox="([^"]+)"/u.exec(svg))[1])
      .split(' ')
      .map(Number)
    expect(viewBox[1]).toBeLessThan(-250)
    expect(svg).toContain(' C ')
  })
})
