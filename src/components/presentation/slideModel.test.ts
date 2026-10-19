import { describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import {
  buildPresentationSlide,
  slideItemWindow,
} from '@renderer/components/presentation/slideModel'

describe('slide content projection', () => {
  it('reuses real topic content, images and shape and prefers explicit speaker notes', () => {
    const document = applyCommand(createDocument('Trip'), {
      type: 'batch',
      commands: [
        { type: 'addTopic', id: 'a', parentId: 'root', title: 'Hotel' },
        { type: 'setTopicNotes', topicId: 'a', notes: 'Check in at 3pm' },
        { type: 'setTopicStyle', topicId: 'a', style: { shape: 'card' } },
        {
          type: 'setTopicImage',
          topicId: 'a',
          width: 100,
          height: 100,
          asset: {
            id: 'photo',
            name: 'photo.png',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
          },
        },
      ],
    })
    const overview = buildPresentationSlide(document, { topicId: 'root' })
    expect(overview?.layout).toBe('image')
    expect(overview?.items[0]).toBe(document.topics.a)
    expect(overview?.items[0]?.style?.shape).toBe('card')
    expect(buildPresentationSlide(document, { topicId: 'a' })?.notes).toBe('Check in at 3pm')
    expect(
      buildPresentationSlide(document, {
        topicId: 'a',
        notes: 'Use side entrance',
        layout: 'list',
      }),
    ).toMatchObject({ notes: 'Use side entrance', layout: 'list' })
    expect(buildPresentationSlide(document, { topicId: 'missing' })).toBeNull()
  })

  it('keeps overview previews bounded and reveals all overflow content through a moving window', () => {
    const document = applyCommand(createDocument('Items'), {
      type: 'batch',
      commands: Array.from({ length: 9 }, (_, index) => ({
        type: 'addTopic' as const,
        id: `i${index}`,
        title: `Item ${index}`,
        parentId: 'root',
      })),
    })
    const slide = buildPresentationSlide(document, { topicId: 'root' })
    expect(slide).not.toBeNull()
    if (!slide) return
    expect(slideItemWindow(slide).map((topic) => topic.id)).toEqual([
      'i0',
      'i1',
      'i2',
      'i3',
      'i4',
      'i5',
    ])
    expect(slideItemWindow(slide, 0)).toEqual([])
    expect(slideItemWindow(slide, 9).map((topic) => topic.id)).toEqual([
      'i3',
      'i4',
      'i5',
      'i6',
      'i7',
      'i8',
    ])
  })
})
