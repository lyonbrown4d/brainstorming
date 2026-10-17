import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument, type LayoutKind, type MindMapDocument } from '@core'
import { getNavigationTarget } from '@renderer/state/keyboard'

const fixture = (layout: LayoutKind = 'map'): MindMapDocument => {
  let document = createDocument('Root')
  for (const [id, parentId] of [
    ['a', 'root'],
    ['b', 'root'],
    ['c', 'root'],
    ['a1', 'a'],
    ['a2', 'a'],
    ['b1', 'b'],
  ] as const)
    document = applyCommand(document, {
      type: 'addTopic',
      parentId,
      id,
      title: id,
      side: 'right',
    })
  return applyCommand(document, { type: 'setDocumentSettings', settings: { layout } })
}

const target = (document: MindMapDocument, id: string, key: string): string | undefined => {
  return getNavigationTarget(document, id, `Arrow${key}`)
}

describe('layout-aware directional navigation', () => {
  it.each(['org-down', 'tree-down', 'tree-table-down', 'matrix'] as const)(
    '%s enters the first branch downward, moves between columns and returns upward',
    (kind) => {
      const document = fixture(kind)
      expect(target(document, 'root', 'Down')).toBe('a')
      expect(target(document, 'a', 'Right')).toBe('b')
      expect(target(document, 'b', 'Left')).toBe('a')
      expect(target(document, 'a', 'Down')).toBe('a1')
      expect(target(document, 'a1', 'Up')).toBe('a')
    },
  )

  it.each(['org-up', 'tree-up'] as const)(
    '%s follows the upward hierarchy and horizontal siblings',
    (kind) => {
      const document = fixture(kind)
      expect(target(document, 'root', 'Up')).toBe('a')
      expect(target(document, 'a', 'Up')).toBe('a1')
      expect(target(document, 'a1', 'Down')).toBe('a')
      expect(target(document, 'a', 'Right')).toBe('b')
    },
  )

  it.each(['logic-left', 'brace-left'] as const)(
    '%s follows visible leftward geometry regardless of stored topic side',
    (kind) => {
      const document = fixture(kind)
      expect(target(document, 'root', 'Left')).toBe('a')
      expect(target(document, 'a', 'Left')).toBe('a1')
      expect(target(document, 'a1', 'Right')).toBe('a')
      expect(target(document, 'a', 'Down')).toBe('b')
    },
  )

  it.each(['logic-right', 'brace-right', 'tree-table-right'] as const)(
    '%s follows the rightward hierarchy and vertical siblings',
    (kind) => {
      const document = fixture(kind)
      expect(target(document, 'root', 'Right')).toBe('a')
      expect(target(document, 'a', 'Right')).toBe('a1')
      expect(target(document, 'a1', 'Left')).toBe('a')
      expect(target(document, 'a', 'Down')).toBe('b')
      expect(target(document, 'a1', 'Down')).toBe('a2')
    },
  )

  it('traverses timeline events horizontally and their branches vertically', () => {
    const document = fixture('timeline')
    expect(target(document, 'root', 'Right')).toBe('a')
    expect(target(document, 'a', 'Right')).toBe('b')
    expect(target(document, 'b', 'Left')).toBe('a')
    expect(target(document, 'a', 'Down')).toBe('a1')
    expect(target(document, 'a1', 'Up')).toBe('a')
  })

  it('traverses vertical timeline events downward and their branches horizontally', () => {
    const document = fixture('timeline-vertical')
    expect(target(document, 'root', 'Down')).toBe('a')
    expect(target(document, 'a', 'Down')).toBe('b')
    expect(target(document, 'b', 'Up')).toBe('a')
    expect(target(document, 'a', 'Right')).toBe('a1')
    expect(target(document, 'a1', 'Left')).toBe('a')
  })

  it('follows fishbone ribs upward or downward and moves along the visible upper row', () => {
    const document = fixture('fishbone')
    expect(target(document, 'root', 'Right')).toBe('a')
    expect(target(document, 'a', 'Up')).toBe('a1')
    expect(target(document, 'b', 'Down')).toBe('b1')
    expect(target(document, 'a1', 'Down')).toBe('a')
    expect(target(document, 'a', 'Right')).toBe('c')
  })

  it('moves across matrix cells with different parents and between rows', () => {
    const document = fixture('matrix')
    expect(target(document, 'a1', 'Right')).toBe('b1')
    expect(target(document, 'b1', 'Left')).toBe('a1')
    expect(target(document, 'a1', 'Down')).toBe('a2')
    expect(target(document, 'a2', 'Up')).toBe('a1')
  })

  it('uses branch structure overrides for outgoing navigation and the incoming parent axis', () => {
    const document = applyCommand(fixture('logic-right'), {
      type: 'setTopicStructure',
      topicId: 'a',
      structure: 'org-down',
    })
    expect(target(document, 'root', 'Right')).toBe('a')
    expect(target(document, 'a', 'Down')).toBe('a1')
    expect(target(document, 'a1', 'Up')).toBe('a')
    expect(target(document, 'a', 'Left')).toBe('root')
  })

  it('preserves mind-map parent/child navigation and keeps same-side sibling ordering', () => {
    const document = applyCommand(fixture(), { type: 'setSide', topicId: 'b', side: 'left' })
    expect(target(document, 'root', 'Right')).toBe('a')
    expect(target(document, 'root', 'Left')).toBe('b')
    expect(target(document, 'a', 'Right')).toBe('a1')
    expect(target(document, 'a1', 'Left')).toBe('a')
    expect(target(document, 'a', 'Down')).toBe('c')
    expect(target(document, 'b', 'Left')).toBe('b1')
    expect(target(document, 'b1', 'Right')).toBe('b')
    expect(target(document, 'b', 'Down')).toBeUndefined()
    expect(target(document, 'root', 'Up')).toBeUndefined()
  })

  it.each(['map', 'org-down', 'timeline', 'matrix', 'fishbone'] as const)(
    '%s never selects hidden descendants after a new immutable collapsed document',
    (kind) => {
      const document = fixture(kind)
      target(document, 'a', 'Down')
      const collapsed = applyCommand(document, { type: 'toggleCollapse', topicId: 'a' })
      for (const direction of ['Up', 'Down', 'Left', 'Right']) {
        expect(['a1', 'a2']).not.toContain(target(collapsed, 'a', direction))
        expect(target(collapsed, 'a1', direction)).toBeUndefined()
      }
      const rootCollapsed = applyCommand(collapsed, { type: 'toggleCollapse', topicId: 'root' })
      for (const direction of ['Up', 'Down', 'Left', 'Right'])
        expect(target(rootCollapsed, 'root', direction)).toBeUndefined()
    },
  )

  it('ignores missing selection and non-directional keys', () => {
    const document = fixture()
    expect(target(document, 'missing', 'Right')).toBeUndefined()
    expect(getNavigationTarget(document, 'a', 'Home')).toBeUndefined()
  })
})
