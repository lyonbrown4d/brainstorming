import { DOMParser } from '@xmldom/xmldom'
import { applyCommand, createDocument } from '@core'
import { createAsset } from '@assets'
import { renderSheetSvg } from '@renderer/export/svg'
import { describe, expect, it } from 'vitest'

describe('proportional topic SVG export', () => {
  it('uses physical bounds and scales base shape, text, image, and marker together', () => {
    const image = createAsset(
      Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=',
          'base64',
        ),
      ),
      'pixel.png',
      'pixel',
    )
    const withImage = applyCommand(createDocument('Scaled topic'), {
      type: 'setTopicImage',
      topicId: 'root',
      asset: image,
      width: 1,
      height: 1,
    })
    const withStyle = applyCommand(withImage, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { width: 200, shape: 'ellipse' },
    })
    const root = withStyle.topics.root
    if (!root) throw new Error('Missing root')
    const normal = {
      ...withStyle,
      topics: { ...withStyle.topics, root: { ...root, metadata: { markers: ['star'] } } },
    }
    const scaled = applyCommand(normal, {
      type: 'setTopicStyle',
      topicId: 'root',
      style: { width: 200, shape: 'ellipse', scale: 2 },
    })
    const baseSvg = renderSheetSvg(normal)
    const exported = renderSheetSvg(scaled)
    expect(exported.width - baseSvg.width).toBe(200)
    const xml = new DOMParser().parseFromString(exported.svg, 'image/svg+xml')
    const group = Array.from(xml.getElementsByTagName('g')).find((node) =>
      node.getAttribute('transform')?.endsWith('scale(2)'),
    )
    expect(group).toBeDefined()
    expect(group?.getElementsByTagName('ellipse')[0]?.getAttribute('rx')).toBe('100')
    expect(group?.getElementsByTagName('text')[0]?.getAttribute('font-size')).toBe('24')
    expect(group?.getElementsByTagName('image')).toHaveLength(1)
    expect(
      Array.from(group?.getElementsByTagName('svg') ?? []).some((node) =>
        node.hasAttribute('data-marker'),
      ),
    ).toBe(true)
  })
})
