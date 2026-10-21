import { describe, expect, it } from 'vitest'
import { applyCommand, validateDocument, type Command, type SpatialSettings } from '@core'
import { extensionFixture } from '@core/extension-test-fixture'

describe('extension validation', () => {
  it.each([
    { mode: '3d', yaw: 0, pitch: 0 },
    { mode: '4d', yaw: 0, pitch: 0, spacing: 0 },
    { mode: '3d', yaw: -Math.PI - 0.01, pitch: 0, spacing: 0 },
    { mode: '3d', yaw: 0, pitch: Math.PI / 2 + 0.01, spacing: 0 },
    { mode: '3d', yaw: 0, pitch: 0, spacing: 201 },
    { mode: '3d', yaw: Number.POSITIVE_INFINITY, pitch: 0, spacing: 0 },
    { mode: '3d', yaw: 0, pitch: Number.NaN, spacing: 0 },
    { mode: '3d', yaw: 0, pitch: 0, spacing: 0, extra: true },
    { mode: '3d', yaw: 0, pitch: 0, spacing: 0, target: { x: 1_000_001, y: 0, z: 0 } },
    { mode: '3d', yaw: 0, pitch: 0, spacing: 0, target: { x: 0, y: 0 } },
    { mode: '3d', yaw: 0, pitch: 0, spacing: 0, target: { x: 0, y: 0, z: 0, extra: true } },
  ])('rejects malformed spatial settings atomically: %j', (spatial) => {
    const source = extensionFixture()
    expect(() =>
      applyCommand(source, {
        type: 'setDocumentSettings',
        settings: { spatial: spatial as SpatialSettings },
      }),
    ).toThrow()
    expect(source.settings?.spatial).toBeUndefined()
  })

  it.each<Command>([
    {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: { link: { kind: 'url', url: 'javascript:alert(1)' } },
    },
    { type: 'setTopicMetadata', topicId: 'a', metadata: { task: { done: false, progress: 101 } } },
    {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: { task: { done: false, start: '2026-02-30' } },
    },
    {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: { task: { done: false, start: '2026-10-16', due: '2026-10-15' } },
    },
    {
      type: 'setTopicMetadata',
      topicId: 'b',
      metadata: { task: { done: false, dependencies: ['child'] } },
    },
    {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: { task: { done: false, dependencies: ['missing'] } },
    },
    {
      type: 'setTopicMetadata',
      topicId: 'a',
      metadata: { link: { kind: 'topic', topicId: 'missing' } },
    },
    { type: 'setTopicMetadata', topicId: 'a', metadata: { labels: ['same', 'same'] } },
    { type: 'upsertRelation', relation: { id: 'bad', from: 'a', to: 'missing' } },
    { type: 'upsertGroup', group: { id: 'bad', kind: 'boundary', topicIds: [] } },
    { type: 'upsertCallout', callout: { id: 'bad', topicId: 'missing', text: 'Text' } },
    { type: 'setPresentation', steps: [{ topicId: 'missing' }] },
    { type: 'setFloatingPosition', topicId: 'floating', x: Number.NaN, y: 0 },
    {
      type: 'setTopicAudio',
      topicId: 'a',
      asset: { id: 'html', name: 'bad.html', mimeType: 'text/html', data: 'AA==' },
    },
  ])('rejects invalid extensions atomically: %j', (command) => {
    const source = extensionFixture()
    const original = JSON.stringify(source)
    expect(() => applyCommand(source, command)).toThrow()
    expect(JSON.stringify(source)).toBe(original)
  })

  it('rejects unknown metadata/settings fields and dangling floating positions at document boundaries', () => {
    const source = extensionFixture()
    const root = source.topics.root
    expect(() => {
      validateDocument({
        ...source,
        topics: { ...source.topics, root: { ...root, metadata: { extra: true } } },
      })
    }).toThrow(/不支持/)
    expect(() => {
      validateDocument({ ...source, settings: { layout: 'map', arbitrary: true } })
    }).toThrow(/不支持/)
    expect(() => {
      validateDocument({ ...source, floatingPositions: { a: { x: 0, y: 0 } } })
    }).toThrow(/游离/)
    expect(() => {
      validateDocument({ ...source, floatingIds: ['child'] })
    }).toThrow(/直接子主题/)
  })
})
