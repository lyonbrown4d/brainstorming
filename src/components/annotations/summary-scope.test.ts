import { describe, expect, it } from 'vitest'
import type { LayoutNode } from '@layout'
import {
  summaryScopeAxis,
  summaryScopeCenter,
  summaryScopeIndex,
} from '@renderer/components/annotations/summary-scope'

describe('summary scope on horizontal sibling layouts', () => {
  it('uses horizontal displacement and keeps the first pointer move anchored', () => {
    const nodes: LayoutNode[] = [0, 140, 280].map((x, index) => ({
      id: `topic-${index}`,
      x,
      y: 80,
      width: 100,
      height: 40,
      side: 'right',
    }))
    const axis = summaryScopeAxis(nodes)
    expect(axis).toBe('x')
    const first = nodes[0]
    if (!first) throw new Error('Test source node missing')
    const center = summaryScopeCenter(first, axis)
    expect(summaryScopeIndex(nodes, axis, center, 0, 0, 2, 0)).toBe(0)
    expect(summaryScopeIndex(nodes, axis, center, 150, 0, 2, 0)).toBe(1)
    expect(summaryScopeIndex(nodes, axis, center, 290, 0, 2, 0)).toBe(2)
  })
})
