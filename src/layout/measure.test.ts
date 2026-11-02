import { describe, expect, it } from 'vitest'
import { measureTopic } from '@layout'
import { measureTopicContent } from '@layout/measure'

describe('topic text measurement', () => {
  it('reserves the renderer border so a single-line leaf stays inside its outline', () => {
    expect(measureTopicContent('短标题').height).toBe(47)
  })

  it('breaks at word boundaries like the browser instead of packing characters', () => {
    const word = 'WWWWWWWWWW'
    expect(measureTopic(`${word} ${word} ${word} ${word}`).height).toBe(4 * 24 + 23)
  })

  it('counts wide glyphs at their real advance so Latin words are not clipped', () => {
    expect(measureTopic('W'.repeat(10)).width).toBe(196)
  })

  it('splits words that cannot fit and still bounds the automatic width', () => {
    expect(measureTopic('W'.repeat(40)).width).toBeLessThanOrEqual(240)
    expect(measureTopic('W'.repeat(40)).height).toBe(4 * 24 + 23)
  })

  it('keeps explicit newlines as separate lines', () => {
    expect(measureTopic('一\n二\n三').height).toBe(3 * 24 + 23)
  })
})
