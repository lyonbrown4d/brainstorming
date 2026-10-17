import { clipboardAnnotations, pasteAnnotations, remapMetadata } from '@core/clipboard-extensions'
import { pruneTopicMetadata } from '@core/extension-references'
import { documentData } from '@core/document'
import { normalizeTopicSelection } from '@core/selection'
import { getSubtreeIds, requireTopic } from '@core/tree'
import { assertAssetId, assetData, referencedAssetIds } from '@core/topic-content'
import type { Command, DocumentAsset, MindMapDocument, Topic, TopicClipboard } from '@core/types'
import { assertId, validateDocument } from '@core/validation'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}

/** Clipboard payloads cross a trust boundary, including when read from system text. */
export const validateTopicClipboard: (value: unknown) => asserts value is TopicClipboard = (
  value: unknown,
): asserts value is TopicClipboard => {
  if (
    !isRecord(value) ||
    value.format !== 'trelyx.topics' ||
    value.version !== 1 ||
    !Array.isArray(value.roots) ||
    value.roots.length === 0 ||
    !isRecord(value.topics)
  )
    throw new Error('主题剪贴板格式无效')
  for (const id of value.roots) assertId(id)
  let rootId = 'clipboard-root'
  while (Object.hasOwn(value.topics, rootId)) rootId += '-'
  const topics: Record<string, unknown> = {}
  for (const [id, topic] of Object.entries(value.topics)) {
    assertId(id)
    if (!isRecord(topic)) throw new Error('主题剪贴板内容无效')
    // A copied document root may contain both sides; paste derives its new branch side.
    topics[id] = {
      ...topic,
      side: topic.side === 'left' || topic.side === 'right' ? 'right' : topic.side,
    }
  }
  topics[rootId] = {
    id: rootId,
    title: '',
    children: value.roots,
    collapsed: false,
    side: 'right',
  }
  validateDocument({
    format: 'trelyx',
    version: 1,
    id: rootId,
    title: '',
    rootId,
    topics,
    ...(Object.hasOwn(value, 'assets') ? { assets: value.assets } : {}),
    ...(Object.hasOwn(value, 'relations') ? { relations: value.relations } : {}),
    ...(Object.hasOwn(value, 'groups') ? { groups: value.groups } : {}),
    ...(Object.hasOwn(value, 'callouts') ? { callouts: value.callouts } : {}),
  })
}

export const createTopicClipboard = (
  document: MindMapDocument,
  topicIds: readonly string[],
): TopicClipboard => {
  validateDocument(document)
  const roots = normalizeTopicSelection(document, topicIds)
  if (roots.length === 0) throw new Error('请选择要复制的主题')
  const topics: Record<string, Topic> = {}
  for (const rootId of roots)
    for (const id of getSubtreeIds(document, rootId)) topics[id] = requireTopic(document, id)
  const retained = new Set(Object.keys(topics))
  for (const topic of Object.values(topics))
    if (topic.metadata)
      topics[topic.id] = { ...topic, metadata: pruneTopicMetadata(topic.metadata, retained) }
  const assets: Record<string, DocumentAsset> = {}
  for (const id of referencedAssetIds(topics)) {
    const asset = document.assets?.[id]
    if (asset) assets[id] = assetData(asset)
  }
  const snapshot = documentData({ ...document, topics, assets })
  return {
    format: 'trelyx.topics',
    version: 1,
    roots,
    topics: snapshot.topics,
    ...clipboardAnnotations(document, retained),
    ...(snapshot.assets === undefined ? {} : { assets: snapshot.assets }),
  }
}

const validateMapping = (
  sourceIds: readonly string[],
  mapping: Readonly<Record<string, string>>,
  existing: Readonly<Record<string, unknown>>,
  assert: (id: unknown) => void,
): void => {
  if (!isRecord(mapping) || Object.keys(mapping).length !== sourceIds.length)
    throw new Error('剪贴板 ID 映射不完整')
  const seen = new Set<string>()
  for (const id of sourceIds) {
    if (!Object.hasOwn(mapping, id)) throw new Error('剪贴板 ID 映射不完整')
    const targetId = mapping[id]
    assert(targetId)
    if (targetId === undefined || seen.has(targetId) || Object.hasOwn(existing, targetId))
      throw new Error('剪贴板 ID 映射存在冲突')
    seen.add(targetId)
  }
}

export const pasteTopics = (
  document: MindMapDocument,
  command: Extract<Command, { type: 'pasteTopics' }>,
): MindMapDocument => {
  validateTopicClipboard(command.clipboard)
  const { clipboard, topicIds, assetIds } = command
  const sourceTopics = documentData({ ...document, topics: clipboard.topics }).topics
  const parent = requireTopic(document, command.parentId)
  validateMapping(Object.keys(clipboard.topics), topicIds, document.topics, assertId)
  validateMapping(
    Object.keys(clipboard.assets ?? {}),
    assetIds,
    document.assets ?? {},
    assertAssetId,
  )
  // Validated mappings contain every source ID; helper keeps unchecked lookups explicit.
  const mapped = (ids: Readonly<Record<string, string>>, id: string): string => {
    const result = ids[id]
    if (result === undefined) throw new Error('剪贴板 ID 映射不完整')
    return result
  }
  const topics = { ...document.topics }
  const assets = { ...document.assets }
  for (const asset of Object.values(clipboard.assets ?? {})) {
    const id = mapped(assetIds, asset.id)
    assets[id] = { ...assetData(asset), id }
  }
  const roots = clipboard.roots.map((id) => mapped(topicIds, id))
  for (const rootId of clipboard.roots) {
    const root = sourceTopics[rootId]
    if (!root) throw new Error('主题剪贴板缺少根主题')
    const side = parent.id === document.rootId ? root.side : parent.side
    const pending = [rootId]
    while (pending.length > 0) {
      const sourceId = pending.pop()
      if (sourceId === undefined) break
      const topic = sourceTopics[sourceId]
      if (!topic) throw new Error('主题剪贴板缺少子主题')
      const id = mapped(topicIds, sourceId)
      topics[id] = {
        ...topic,
        id,
        side,
        children: topic.children.map((childId) => mapped(topicIds, childId)),
        ...(topic.metadata === undefined
          ? {}
          : { metadata: remapMetadata(topic.metadata, topicIds, assetIds) }),
        ...(topic.style === undefined ? {} : { style: { ...topic.style } }),
        ...(topic.image === undefined
          ? {}
          : { image: { ...topic.image, assetId: mapped(assetIds, topic.image.assetId) } }),
        ...(topic.attachments === undefined
          ? {}
          : { attachments: topic.attachments.map((assetId) => mapped(assetIds, assetId)) }),
      }
      for (const childId of topic.children) pending.push(childId)
    }
  }
  topics[parent.id] = { ...parent, children: [...parent.children, ...roots], collapsed: false }
  return {
    ...document,
    topics,
    ...pasteAnnotations(document, clipboard, topicIds, command.annotationIds),
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
  }
}
