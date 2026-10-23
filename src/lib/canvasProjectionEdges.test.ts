import { expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import { canvasProjectionEdges } from '@renderer/lib/canvasProjectionEdges'

it('keeps structural metadata hidden in RF and applies relation selection only in its owning sheet', () => {
  const structural: Edge = { id: 'edge', source: 'root', target: 'topic', type: 'structure' }
  const relation: Edge = {
    id: 'relation-link',
    source: 'root',
    target: 'topic',
    type: 'relation',
    data: { waypoints: [{ x: 20, y: 10 }] },
    markerEnd: 'arrow',
  }
  const selected = { kind: 'relation' as const, id: 'link', sheetId: 'sheet' }
  const active = canvasProjectionEdges([structural, relation], 'sheet', selected, false)
  expect(active[0]).toEqual({ ...structural, hidden: true })
  expect(active[1]).toEqual({ ...relation, selected: true, reconnectable: true })
  expect(canvasProjectionEdges([relation], 'other', selected, false)[0]?.selected).toBe(false)
  const playing = canvasProjectionEdges([relation], 'sheet', selected, true)[0]
  expect(playing?.selected).toBe(false)
  expect(playing?.reconnectable).toBe(false)
  expect(relation.selected).toBeUndefined()
})
