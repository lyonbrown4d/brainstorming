import { extensionFixture } from '@core/extension-test-fixture'
import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createDocument,
  createHistory,
  executeCommand,
  undo,
  redo,
  serializeDocument,
  deserializeDocument,
  validateDocument,
  createTopicClipboard,
  validateTopicClipboard,
  type Command,
} from '@core'

describe('local document extensions', () => {
  it('persists spatial settings as one undoable document-settings change', () => {
    const original = createHistory(createDocument('空间视图'))
    const spatial = {
      mode: '3d' as const,
      yaw: Math.PI,
      pitch: -Math.PI / 2,
      spacing: 200,
      target: { x: 25, y: -10, z: 1_000_000 },
    }
    const updated = executeCommand(original, {
      type: 'setDocumentSettings',
      settings: { layout: 'map', spatial },
    })
    expect(updated.document.settings?.spatial).toEqual(spatial)
    expect(deserializeDocument(serializeDocument(updated.document))).toEqual(updated.document)
    expect(undo(updated).document).toBe(original.document)
    spatial.spacing = 0
    spatial.target.x = 0
    expect(updated.document.settings?.spatial?.spacing).toBe(200)
    expect(updated.document.settings?.spatial?.target?.x).toBe(25)
  })

  it('roundtrips all extensions and audio references through additive v1 JSON snapshots', () => {
    const source = extensionFixture()
    const result = deserializeDocument(serializeDocument(source))
    expect(result).toEqual(source)
    expect(result.version).toBe(1)
    expect(result.topics.a?.metadata).not.toBe(source.topics.a?.metadata)
    expect(result.groups?.[0]?.topicIds).not.toBe(source.groups?.[0]?.topicIds)
    expect(result.presentation).not.toBe(source.presentation)
    expect(result.assets?.voice?.data).toBe('UklGRgQAAABXQVZF')
    expect(result.floatingPositions?.floating).toEqual({ x: 120, y: -40 })
  })

  it('deletes all dependent annotations, links, tasks, presentation and floating references with undo', () => {
    const history = createHistory(extensionFixture())
    const changed = executeCommand(history, { type: 'deleteTopics', topicIds: ['b', 'floating'] })
    expect(changed.document.relations).toEqual([])
    expect(changed.document.topics.a?.metadata?.link).toBeUndefined()
    expect(changed.document.topics.a?.metadata?.task?.dependencies).toEqual([])
    expect(changed.document.floatingIds).toEqual([])
    expect(changed.document.floatingPositions).toEqual({})
    expect(changed.document.presentation?.map(({ topicId }) => topicId)).toEqual(['a'])
    const removedBranch = executeCommand(changed, { type: 'deleteTopic', topicId: 'a' })
    expect(removedBranch.document.groups).toEqual([])
    expect(removedBranch.document.callouts).toEqual([])
    expect(removedBranch.document.presentation).toEqual([])
    expect(undo(changed).document).toBe(history.document)
    expect(redo(undo(changed)).document).toBe(changed.document)
    validateDocument(removedBranch.document)
  })

  it('clears floating semantics on normal moves and supports explicit attachment and position undo', () => {
    const source = extensionFixture()
    const moved = applyCommand(source, { type: 'moveTopic', topicId: 'floating', parentId: 'a' })
    expect(moved.floatingIds).toEqual([])
    expect(moved.floatingPositions).toEqual({})
    expect(moved.topics.a?.children).toEqual(['child', 'floating'])
    const attached = applyCommand(source, {
      type: 'attachFloatingTopic',
      topicId: 'floating',
      parentId: 'b',
    })
    expect(attached.floatingIds).toEqual([])
    expect(attached.topics.b?.children).toEqual(['floating'])
    const positioned = executeCommand(createHistory(source), {
      type: 'setFloatingPosition',
      topicId: 'floating',
      x: -200,
      y: 500,
    })
    expect(positioned.document.floatingPositions?.floating).toEqual({ x: -200, y: 500 })
    expect(undo(positioned).document).toBe(source)
    expect(() =>
      applyCommand(source, { type: 'setFloatingPosition', topicId: 'a', x: 0, y: 0 }),
    ).toThrow()
  })

  it('upserts annotations in place, removes them by ID, and clears full replacements without a second undo', () => {
    const source = extensionFixture()
    const updated = applyCommand(source, {
      type: 'batch',
      commands: [
        {
          type: 'upsertRelation',
          relation: { id: 'relation', from: 'a', to: 'child', title: 'Updated' },
        },
        { type: 'upsertGroup', group: { id: 'group', kind: 'summary', topicIds: ['a'] } },
        { type: 'upsertCallout', callout: { id: 'callout', topicId: 'a', text: 'Updated' } },
      ],
    })
    expect(updated.relations).toHaveLength(1)
    expect(updated.relations?.[0]?.title).toBe('Updated')
    expect(updated.groups?.[0]?.kind).toBe('summary')
    expect(updated.callouts?.[0]?.topicId).toBe('a')
    const cleared = applyCommand(updated, {
      type: 'batch',
      commands: [
        { type: 'removeRelation', relationId: 'relation' },
        { type: 'removeGroup', groupId: 'group' },
        { type: 'removeCallout', calloutId: 'callout' },
        { type: 'setTopicMetadata', topicId: 'a', metadata: {} },
        { type: 'setTopicStructure', topicId: 'a' },
        { type: 'setDocumentSettings', settings: {} },
        { type: 'setPresentation', steps: [] },
      ],
    })
    expect(cleared.topics.a?.metadata).toBeUndefined()
    expect(cleared.topics.a?.structure).toBeUndefined()
    expect(cleared.settings).toBeUndefined()
    expect(cleared.relations).toEqual([])
    expect(cleared.groups).toEqual([])
    expect(cleared.callouts).toEqual([])
  })

  it('invalidates stale rich-title markup after plain edits and preserves explicitly synchronized rich batches', () => {
    const source = extensionFixture()
    expect(applyCommand(source, { type: 'renameTopic', topicId: 'a', title: 'A' })).toBe(source)
    const renamed = applyCommand(source, { type: 'renameTopic', topicId: 'a', title: 'Plain' })
    expect(renamed.topics.a?.metadata?.richTitle).toBeUndefined()
    expect(renamed.topics.a?.metadata?.labels).toEqual(['设计', 'review'])
    const replaced = applyCommand(source, {
      type: 'replaceTopicText',
      topicId: 'a',
      query: 'A',
      replacement: 'B',
    })
    expect(replaced.topics.a?.metadata?.richTitle).toBeUndefined()
    const notesOnly = applyCommand(source, {
      type: 'replaceTopicText',
      topicId: 'a',
      query: 'A',
      replacement: 'B',
      field: 'notes',
    })
    expect(notesOnly.topics.a?.metadata?.richTitle).toBe('**A**')
    const rich = applyCommand(source, {
      type: 'batch',
      commands: [
        { type: 'renameTopic', topicId: 'a', title: 'Updated' },
        { type: 'setTopicMetadata', topicId: 'a', metadata: { richTitle: '**Updated**' } },
      ],
    })
    expect(rich.topics.a?.title).toBe('Updated')
    expect(rich.topics.a?.metadata?.richTitle).toBe('**Updated**')
  })

  it('copies covered annotations and remaps internal metadata and audio without retaining outside links', () => {
    const source = extensionFixture()
    const clipboard = createTopicClipboard(source, ['a'])
    validateTopicClipboard(clipboard)
    expect(clipboard.relations).toEqual([])
    expect(clipboard.topics.a?.metadata?.link).toBeUndefined()
    expect(clipboard.topics.a?.metadata?.task?.dependencies).toEqual([])
    expect(clipboard.groups).toHaveLength(1)
    expect(clipboard.callouts).toHaveLength(1)
    const command: Command = {
      type: 'pasteTopics',
      parentId: 'root',
      clipboard,
      topicIds: { a: 'copy-a', child: 'copy-child' },
      assetIds: { voice: 'copy-voice' },
    }
    const pasted = applyCommand(source, command)
    expect(pasted.topics['copy-child']?.metadata?.link).toEqual({
      kind: 'topic',
      topicId: 'copy-a',
    })
    expect(pasted.topics['copy-child']?.metadata?.task?.dependencies).toEqual(['copy-a'])
    expect(pasted.topics['copy-a']?.metadata?.audioAssetId).toBe('copy-voice')
    expect(pasted.groups?.[1]).toMatchObject({
      id: 'copy-copy-a-group',
      topicIds: ['copy-a', 'copy-child'],
    })
    expect(pasted.callouts?.[1]).toMatchObject({ id: 'copy-copy-a-callout', topicId: 'copy-child' })
    const renamed = applyCommand(createDocument('Target', 'target'), {
      ...command,
      annotationIds: { group: 'mapped-group', callout: 'mapped-callout' },
    })
    expect(renamed.groups?.[0]?.id).toBe('mapped-group')
    expect(() =>
      applyCommand(source, {
        ...command,
        annotationIds: { group: 'duplicate', callout: 'duplicate' },
      }),
    ).toThrow()
    expect(() =>
      applyCommand(source, { ...command, annotationIds: { group: 'only-one' } }),
    ).toThrow()
  })

  it('copies internal relationships and avoids automatically generated annotation ID collisions', () => {
    const source = extensionFixture()
    const clipboard = createTopicClipboard(source, ['a', 'b'])
    const target = applyCommand(createDocument('Target', 'target'), {
      type: 'upsertCallout',
      callout: { id: 'copy-copy-a-relation', topicId: 'root', text: 'Existing' },
    })
    const result = applyCommand(target, {
      type: 'pasteTopics',
      parentId: 'root',
      clipboard,
      topicIds: { a: 'copy-a', child: 'copy-child', b: 'copy-b' },
      assetIds: { voice: 'copy-voice' },
    })
    expect(result.relations?.[0]).toMatchObject({
      id: 'copy-copy-a-relation-1',
      from: 'copy-a',
      to: 'copy-b',
    })
    expect(result.topics['copy-a']?.metadata?.link).toEqual({ kind: 'topic', topicId: 'copy-b' })
  })
})
