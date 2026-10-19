import type { Command, MindMapDocument, Topic } from '@core/types'
import { applyDrawingCommand } from '@core/ink'
import type { ExtensionCommand } from '@core/extensions'
import { assertId } from '@core/validation'
import { requireTopic } from '@core/tree'
import { withAsset } from '@core/content-commands'
import {
  validateDocumentSettings,
  validateLayoutKind,
  validateTopicMetadata,
} from '@core/metadata-validation'
import {
  validateFloatingPosition,
  validatePresentationStep,
  validateRelation,
  validateTopicCallout,
  validateTopicGroup,
} from '@core/annotation-validation'
import { clearFloatingRoots } from '@core/extension-references'
import { moveTopics } from '@core/selection-commands'
import { validateAudioAsset } from '@core/topic-content'

const extensionTypes = new Set([
  'upsertDrawing',
  'removeDrawing',
  'setTopicMetadata',
  'setTopicStructure',
  'setTopicAudio',
  'setDocumentSettings',
  'upsertRelation',
  'removeRelation',
  'upsertGroup',
  'removeGroup',
  'upsertCallout',
  'removeCallout',
  'addFloatingTopic',
  'setFloatingPosition',
  'attachFloatingTopic',
  'setPresentation',
])
export const isExtensionCommand = (command: Command): command is ExtensionCommand => {
  return extensionTypes.has(command.type)
}
const same = (left: unknown, right: unknown): boolean => {
  return JSON.stringify(left) === JSON.stringify(right)
}
const replaceTopic = (document: MindMapDocument, topic: Topic): MindMapDocument => {
  return same(document.topics[topic.id], topic)
    ? document
    : { ...document, topics: { ...document.topics, [topic.id]: topic } }
}
const upsert = <T extends { readonly id: string }>(
  values: readonly T[] | undefined,
  value: T,
): readonly T[] => {
  const found = values?.findIndex(({ id }) => id === value.id) ?? -1
  const result = [...(values ?? [])]
  if (found < 0) result.push(structuredClone(value))
  else result[found] = structuredClone(value)
  return result
}
export const applyExtensionCommand = (
  document: MindMapDocument,
  command: ExtensionCommand,
): MindMapDocument => {
  if (command.type === 'upsertDrawing' || command.type === 'removeDrawing')
    return applyDrawingCommand(document, command)
  switch (command.type) {
    case 'setTopicMetadata': {
      validateTopicMetadata(command.metadata)
      const topic = { ...requireTopic(document, command.topicId) }
      if (Object.keys(command.metadata).length === 0) delete topic.metadata
      else topic.metadata = structuredClone(command.metadata)
      return replaceTopic(document, topic)
    }
    case 'setTopicStructure': {
      const topic = { ...requireTopic(document, command.topicId) }
      if (command.structure === undefined) delete topic.structure
      else {
        validateLayoutKind(command.structure)
        topic.structure = command.structure
      }
      return replaceTopic(document, topic)
    }
    case 'setTopicAudio': {
      validateAudioAsset(command.asset)
      const topic = requireTopic(document, command.topicId)
      const updated = withAsset(document, command.asset)
      return replaceTopic(updated, {
        ...topic,
        metadata: { ...topic.metadata, audioAssetId: command.asset.id },
      })
    }
    case 'setDocumentSettings': {
      validateDocumentSettings(command.settings)
      const result = { ...document }
      if (Object.keys(command.settings).length === 0) delete result.settings
      else result.settings = structuredClone(command.settings)
      return same(result.settings, document.settings) ? document : result
    }
    case 'upsertRelation': {
      validateRelation(command.relation)
      const relations = upsert(document.relations, command.relation)
      return same(relations, document.relations) ? document : { ...document, relations }
    }
    case 'removeRelation': {
      assertId(command.relationId)
      if (!document.relations?.some(({ id }) => id === command.relationId)) return document
      return {
        ...document,
        relations: document.relations.filter(({ id }) => id !== command.relationId),
      }
    }
    case 'upsertGroup': {
      validateTopicGroup(command.group)
      const groups = upsert(document.groups, command.group)
      return same(groups, document.groups) ? document : { ...document, groups }
    }
    case 'removeGroup': {
      assertId(command.groupId)
      if (!document.groups?.some(({ id }) => id === command.groupId)) return document
      return { ...document, groups: document.groups.filter(({ id }) => id !== command.groupId) }
    }
    case 'upsertCallout': {
      validateTopicCallout(command.callout)
      const callouts = upsert(document.callouts, command.callout)
      return same(callouts, document.callouts) ? document : { ...document, callouts }
    }
    case 'removeCallout': {
      assertId(command.calloutId)
      if (!document.callouts?.some(({ id }) => id === command.calloutId)) return document
      return {
        ...document,
        callouts: document.callouts.filter(({ id }) => id !== command.calloutId),
      }
    }
    case 'addFloatingTopic': {
      assertId(command.id)
      if (Object.hasOwn(document.topics, command.id)) throw new Error('主题 ID 已存在')
      if (typeof command.title !== 'string') throw new Error('主题标题须为文本')
      const position = { x: command.x, y: command.y }
      validateFloatingPosition(position)
      const root = requireTopic(document, document.rootId)
      return {
        ...document,
        topics: {
          ...document.topics,
          [root.id]: { ...root, children: [...root.children, command.id], collapsed: false },
          [command.id]: {
            id: command.id,
            title: command.title,
            children: [],
            collapsed: false,
            side: 'right',
          },
        },
        floatingIds: [...(document.floatingIds ?? []), command.id],
        floatingPositions: { ...document.floatingPositions, [command.id]: position },
      }
    }
    case 'setFloatingPosition': {
      requireTopic(document, command.topicId)
      if (!document.floatingIds?.includes(command.topicId))
        throw new Error('只能设置游离主题的位置')
      const position = { x: command.x, y: command.y }
      validateFloatingPosition(position)
      return same(position, document.floatingPositions?.[command.topicId])
        ? document
        : {
            ...document,
            floatingPositions: { ...document.floatingPositions, [command.topicId]: position },
          }
    }
    case 'attachFloatingTopic': {
      if (!document.floatingIds?.includes(command.topicId)) throw new Error('主题不是游离主题')
      return clearFloatingRoots(
        moveTopics(document, { ...command, type: 'moveTopics', topicIds: [command.topicId] }),
        [command.topicId],
      )
    }
    case 'setPresentation': {
      if (!Array.isArray(command.steps) || command.steps.length > 1000)
        throw new Error('演示步骤数量无效')
      for (const step of command.steps as readonly unknown[]) validatePresentationStep(step)
      return same(command.steps, document.presentation)
        ? document
        : { ...document, presentation: structuredClone(command.steps) }
    }
  }
}
