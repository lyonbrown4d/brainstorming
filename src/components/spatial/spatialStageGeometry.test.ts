import { describe, expect, it } from 'vitest'
import type { MindMapLayout } from '@layout'
import {
  stageFloorExtent,
  stageFloorHeight,
} from '@renderer/components/spatial/spatialStageGeometry'

const layout: MindMapLayout = {
  nodes: [
    { id: 'near', x: 10, y: 20, width: 100, height: 40, side: 'right' },
    { id: 'far', x: 1000, y: 1000, width: 100, height: 40, side: 'right' },
  ],
  edges: [],
}

describe('spatial ground', () => {
  it('stays below canonical topics as their positions change', () => {
    expect(stageFloorHeight(layout)).toBe(1140)
    expect(stageFloorHeight({ nodes: [], edges: [] })).toBe(100)
  })

  it('frames the content and viewport while bounding the rendered grid', () => {
    expect(stageFloorExtent(layout, 500)).toBe(1900)
    expect(stageFloorExtent(layout, 2000)).toBe(4000)
    expect(stageFloorExtent(layout, 100000)).toBe(12000)
  })
})
