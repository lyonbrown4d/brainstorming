import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { layoutDocument } from '@layout'
import { renderSheetSvg } from '@renderer/export/svg'
import { buildVisualGeometry } from '@renderer/lib/visualGeometry'

const fixture = () => {
  let document = createDocument('视觉路径', 'visual-sheet')
  document = applyCommand(document, {
    type: 'addTopic',
    parentId: 'root',
    id: 'sticky',
    title: '便签',
  })
  document = applyCommand(document, {
    type: 'setTopicStyle',
    topicId: 'sticky',
    style: { shape: 'sticky' },
  })
  document = applyCommand(document, {
    type: 'addTopic',
    parentId: 'root',
    id: 'card',
    title: '卡片',
  })
  document = applyCommand(document, {
    type: 'setTopicStyle',
    topicId: 'card',
    style: { shape: 'card' },
  })
  document = applyCommand(document, {
    type: 'upsertDrawing',
    stroke: {
      id: 'pen',
      color: '#123456',
      width: 4,
      points: [
        { x: 10, y: 10, pressure: 0.5 },
        { x: 30, y: 20, pressure: 0.8 },
      ],
    },
  })
  return document
}

describe('native scene visual geometry', () => {
  it('uses the exact sketch and ink paths already drawn by SVG export', () => {
    const plain = fixture()
    const document = applyCommand(plain, {
      type: 'setDocumentSettings',
      settings: { ...plain.settings, visualStyle: 'sketch' },
    })
    const layout = layoutDocument(document)
    const measurements = layout.nodes.map(({ id, width, height }) => ({ id, width, height }))
    const geometry = buildVisualGeometry(document, layout, measurements)
    const { svg } = renderSheetSvg(document)
    expect(geometry.measurements).toBe(measurements)
    for (const path of [
      ...Object.values(geometry.topicOutlines),
      ...Object.values(geometry.topicFills),
      ...Object.values(geometry.topicAccents),
      ...Object.values(geometry.edgePaths),
      ...Object.values(geometry.decorationPaths),
      ...Object.values(geometry.drawingPaths),
    ])
      expect(svg).toContain(`d="${path}"`)
    expect(geometry.topicAccents['sticky:fold']).toBeTruthy()
    expect(geometry.topicAccents['card:header']).toBeTruthy()
    expect(geometry.drawingPaths.pen).toBeTruthy()
  })

  it('leaves ordinary paths to the native scene while preserving ink', () => {
    const document = fixture()
    const layout = layoutDocument(document)
    const geometry = buildVisualGeometry(document, layout, [])
    expect(geometry.topicOutlines).toEqual({})
    expect(geometry.edgePaths).toEqual({})
    expect(geometry.drawingPaths.pen).toBeTruthy()
  })
})
