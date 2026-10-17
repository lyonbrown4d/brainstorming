import { documentExtensionData, topicExtensionData } from '@core/extension-data'
import { applyCommand } from '@core/commands'
import type { MindMapDocument, Side, Topic } from '@core/types'
import { assertId, validateDocument } from '@core/validation'
import { normalizeTopicStyle } from '@core/topic-style'
import { documentAssetsData } from '@core/topic-content'

export const createDocument = (
  title = '中心主题',
  id = `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
): MindMapDocument => {
  assertId(id)
  if (typeof title !== 'string') throw new Error('标题必须是文本')
  return {
    format: 'trelyx',
    version: 1,
    id,
    title,
    rootId: 'root',
    topics: { root: { id: 'root', title, children: [], collapsed: false, side: 'right' } },
  }
}

export const createExampleDocument = (): MindMapDocument => {
  let document = createDocument('产品规划', 'trelyx-example')
  const branches: readonly [string, string, Side, readonly string[]][] = [
    ['vision', '产品愿景', 'left', ['让思考自由生长', '本地优先']],
    ['users', '目标用户', 'left', ['独立创作者', '产品与设计团队']],
    ['experience', '核心体验', 'right', ['快捷记录灵感', '清晰组织想法']],
    ['plan', '下一步计划', 'right', ['验证关键交互', '打磨桌面体验']],
  ]
  for (const [id, title, side, children] of branches) {
    document = applyCommand(document, { type: 'addTopic', parentId: 'root', id, title, side })
    for (const [index, childTitle] of children.entries()) {
      document = applyCommand(document, {
        type: 'addTopic',
        parentId: id,
        id: `${id}-${index}`,
        title: childTitle,
      })
    }
  }
  return document
}

export const serializeDocument = (document: MindMapDocument): string => {
  validateDocument(document)
  return JSON.stringify(documentData(document), null, 2)
}

export const deserializeDocument = (json: string): MindMapDocument => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  validateDocument(parsed)
  return documentData(parsed)
}

export const documentData = (
  document: MindMapDocument,
  preserveUnusedAssets = false,
): MindMapDocument => {
  const topics: Record<string, Topic> = {}
  for (const topic of Object.values(document.topics)) {
    topics[topic.id] = {
      ...topicExtensionData(topic),
      id: topic.id,
      title: topic.title,
      children: [...topic.children],
      collapsed: topic.collapsed,
      side: topic.side,
      ...(topic.style === undefined ? {} : { style: normalizeTopicStyle(topic.style) }),
      ...(topic.notes?.trim() ? { notes: topic.notes } : {}),
      ...(topic.image === undefined
        ? {}
        : {
            image: {
              assetId: topic.image.assetId,
              width: topic.image.width,
              height: topic.image.height,
            },
          }),
      ...(topic.attachments?.length ? { attachments: [...topic.attachments] } : {}),
    }
  }
  const assets = documentAssetsData(document, preserveUnusedAssets)
  return {
    format: 'trelyx',
    version: 1,
    id: document.id,
    title: document.title,
    ...documentExtensionData(document),
    rootId: document.rootId,
    topics,
    ...(assets === undefined ? {} : { assets }),
  }
}
