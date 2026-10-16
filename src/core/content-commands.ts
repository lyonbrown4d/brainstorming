import type { DocumentAsset, MindMapDocument, Topic, TopicContentCommand } from './types'
import {
  assetData,
  validateDocumentAsset,
  validateTopicImage,
  validateTopicNotes,
} from './topic-content'
import { validateDocument } from './validation'

function withAsset(document: MindMapDocument, asset: DocumentAsset): MindMapDocument {
  validateDocumentAsset(asset)
  const existing = Object.hasOwn(document.assets ?? {}, asset.id)
    ? document.assets?.[asset.id]
    : undefined
  if (existing) {
    if (
      existing.data !== asset.data ||
      existing.name !== asset.name ||
      existing.mimeType !== asset.mimeType
    )
      throw new Error('资源 ID 已被其他内容占用')
    return document
  }
  return { ...document, assets: { ...document.assets, [asset.id]: assetData(asset) } }
}

function replaceTopic(document: MindMapDocument, topic: Topic): MindMapDocument {
  const result = { ...document, topics: { ...document.topics, [topic.id]: topic } }
  validateDocument(result)
  return result
}

export function applyTopicContentCommand(
  document: MindMapDocument,
  topic: Topic,
  command: TopicContentCommand,
): MindMapDocument {
  switch (command.type) {
    case 'setTopicNotes': {
      validateTopicNotes(command.notes)
      const notes = command.notes.trim().length > 0 ? command.notes : undefined
      if ((topic.notes ?? undefined) === notes) return document
      const updated = { ...topic }
      if (notes === undefined) delete updated.notes
      else updated.notes = notes
      return replaceTopic(document, updated)
    }
    case 'setTopicImage': {
      const image = { assetId: command.asset.id, width: command.width, height: command.height }
      validateTopicImage(image)
      const withBytes = withAsset(document, command.asset)
      if (
        topic.image?.assetId === image.assetId &&
        topic.image.width === image.width &&
        topic.image.height === image.height
      )
        return document
      return replaceTopic(withBytes, { ...topic, image })
    }
    case 'removeTopicImage': {
      if (topic.image === undefined) return document
      const updated = { ...topic }
      delete updated.image
      return replaceTopic(document, updated)
    }
    case 'addTopicAttachment': {
      const withBytes = withAsset(document, command.asset)
      if (topic.attachments?.includes(command.asset.id)) return document
      return replaceTopic(withBytes, {
        ...topic,
        attachments: [...(topic.attachments ?? []), command.asset.id],
      })
    }
    case 'removeTopicAttachment': {
      if (!topic.attachments?.includes(command.assetId)) return document
      const attachments = topic.attachments.filter((id) => id !== command.assetId)
      const updated = { ...topic }
      if (attachments.length === 0) delete updated.attachments
      else updated.attachments = attachments
      return replaceTopic(document, updated)
    }
  }
}
