import { describe, expect, it } from 'vitest'
import { wcagContrast } from 'culori'
import { applyCommand, createDocument, serializeDocument, type DocumentSettings } from '@core'
import { canvasBackground, documentAppearance, topicAppearance } from '@shared/appearance'
import { mapPalettes } from '@shared/palettes'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'

const original = applyCommand(createDocument('产品规划'), {
  type: 'addTopic',
  parentId: 'root',
  id: 'design',
  title: '视觉设计',
  side: 'right',
})

describe('canvas appearance is a view projection', () => {
  it('adapts default canvas and automatic node fills without changing content or portable colors', () => {
    const before = serializeDocument(original)
    const portable = topicAppearance(original, 'design')
    const light = topicAppearance(original, 'design', '#f7f7f2')
    const dark = topicAppearance(original, 'design', '#1c1e22')
    expect(documentAppearance(original, '#1c1e22').background).toBe('#1c1e22')
    expect(light.fill).not.toBe(dark.fill)
    expect(dark.stroke).toBe(light.stroke)
    for (const surface of ['#f7f7f2', '#1c1e22']) {
      for (const id of ['root', 'design']) {
        const style = topicAppearance(original, id, surface)
        expect(wcagContrast(style.fill, style.color)).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(serializeDocument(original)).toBe(before)
    expect(topicAppearance(original, 'design')).toEqual(portable)
    const projection = projectCanvas(original, '#1c1e22')
    expect(
      projection.nodes.filter((node) => node.type !== 'ink').find((node) => node.id === 'design')
        ?.data.fill,
    ).toBe(dark.fill)
    expect(projection.nodes.map((node) => node.position)).toEqual(
      projectCanvas(original).nodes.map((node) => node.position),
    )
  })

  it('preserves independent presets, custom palettes and explicitly chosen backgrounds', () => {
    const cases: readonly { settings: DocumentSettings; expected: string }[] = [
      { settings: { theme: 'night' as const }, expected: mapPalettes[7].background },
      { settings: { theme: 'ocean' as const }, expected: mapPalettes[1].background },
      { settings: { background: '#faf0dc' }, expected: '#faf0dc' },
      {
        settings: {
          customPalette: {
            name: '自定义',
            root: '#7564cc',
            background: '#f5eedd',
            branches: ['#d87578', '#399f91', '#c8953d', '#5c86c6', '#9784c6'],
          },
        },
        expected: '#f5eedd',
      },
    ]
    for (const { settings, expected } of cases) {
      const styled = applyCommand(original, { type: 'setDocumentSettings', settings })
      expect(canvasBackground(styled, '#1c1e22')).toBe(expected)
      expect(documentAppearance(styled, '#1c1e22').background).toBe(expected)
    }
  })

  it('retains explicit topic fill and text colors in both appearances', () => {
    const styled = applyCommand(original, {
      type: 'setTopicStyle',
      topicId: 'design',
      style: { fill: '#ffffff', color: '#112233' },
    })
    for (const surface of ['#f7f7f2', '#1c1e22'])
      expect(topicAppearance(styled, 'design', surface)).toMatchObject({
        fill: '#ffffff',
        color: '#112233',
      })
  })
  it('keeps transparent text readable and sticky notes recognizable while respecting explicit colors', () => {
    for (const surface of ['#f7f7f2', '#1c1e22']) {
      const text = applyCommand(original, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { shape: 'text' },
      })
      expect(topicAppearance(text, 'root', surface).fill).toBe(surface)
      expect(
        wcagContrast(surface, topicAppearance(text, 'root', surface).color),
      ).toBeGreaterThanOrEqual(4.5)
      const sticky = applyCommand(original, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { shape: 'sticky' },
      })
      const style = topicAppearance(sticky, 'root', surface)
      expect(style.fill).toBe('#fff1a8')
      expect(wcagContrast(style.fill, style.color)).toBeGreaterThanOrEqual(4.5)
      const custom = applyCommand(sticky, {
        type: 'setTopicStyle',
        topicId: 'root',
        style: { shape: 'sticky', fill: '#112233', color: '#ffffff' },
      })
      expect(topicAppearance(custom, 'root', surface)).toMatchObject({
        fill: '#112233',
        color: '#ffffff',
      })
    }
  })
})
