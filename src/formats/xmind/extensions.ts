import type { DocumentExtensions } from '../../core/extensions'
import type { MindMapDocument, Topic } from '../../core'
import { validateDocument, validateTopicImage } from '../../core'
import { documentExtensionData } from '../../core/extension-data'
import { validateLayoutKind, validateTopicMetadata } from '../../core/metadata-validation'
import { normalizeTopicStyle, validateTopicStyle } from '../../core/topic-style'
import type { EmbeddedContent } from './content'
import { list, record, type SourceRecord, type Warnings } from './common'

export const TRELYX_PROVIDER = 'org.trelyx.interchange'
export function trelyxExtension(
  source: SourceRecord,
  warnings: Warnings,
  kind: 'sheet' | 'topic' = 'topic',
): SourceRecord | undefined {
  let own: SourceRecord | undefined
  const entries = list(source.extensions, 'extensions')
  if (entries.length > 64) throw new Error('XMind 扩展数量超过限制')
  for (const entry of entries) {
    const extension = record(entry, 'extension')
    if (extension.provider !== TRELYX_PROVIDER) {
      warnings.add('未导入 XMind 第三方扩展内容')
      continue
    }
    if (own) throw new Error('XMind Trelyx 扩展重复')
    own = record(extension.content, 'Trelyx extension.content')
    warnings.omitted(
      own,
      new Set(
        kind === 'sheet'
          ? [
              'settings',
              'relations',
              'groups',
              'callouts',
              'floatingIds',
              'floatingPositions',
              'presentation',
              'workbook',
            ]
          : ['side', 'style', 'metadata', 'structure', 'attachments', 'audio', 'image'],
      ),
    )
  }
  return own
}
export function restoreTopicExtension(
  topic: Topic,
  extension: SourceRecord | undefined,
  content: EmbeddedContent,
): Topic {
  if (!extension) return topic
  const result = { ...topic }
  if (extension.side !== undefined) {
    if (extension.side !== 'left' && extension.side !== 'right')
      throw new Error('XMind 主题方向扩展无效')
    result.side = extension.side
  }
  if (extension.style !== undefined) {
    validateTopicStyle(extension.style)
    result.style = normalizeTopicStyle(extension.style)
  }
  if (extension.metadata !== undefined) {
    validateTopicMetadata(extension.metadata)
    result.metadata = structuredClone(extension.metadata)
  }
  if (extension.structure !== undefined) {
    validateLayoutKind(extension.structure)
    result.structure = extension.structure
  }
  if (extension.attachments !== undefined) {
    const attachments = list(extension.attachments, 'Trelyx attachments')
    if (attachments.length > 32) throw new Error('XMind 主题附件超过 32 个')
    result.attachments = attachments.map((value) => {
      const source = record(value, 'Trelyx attachment')
      const asset = content.resource(source.src, false, source.name, source.mimeType)
      if (!asset) throw new Error('XMind Trelyx 附件缺失或无效')
      return asset.id
    })
  }
  if (extension.audio !== undefined) {
    const source = record(extension.audio, 'Trelyx audio')
    const asset = content.resource(source.src, false, source.name, source.mimeType)
    if (!asset) throw new Error('XMind Trelyx 音频缺失或无效')
    result.metadata = { ...result.metadata, audioAssetId: asset.id }
  }
  if (extension.image !== undefined && result.image) {
    const image = record(extension.image, 'Trelyx image')
    const asset = content.resource(
      record(extension.image, 'Trelyx image').src,
      true,
      image.name,
      image.mimeType,
    )
    if (!asset) throw new Error('XMind Trelyx 图片缺失或无效')
    const candidate = { assetId: asset.id, width: image.width, height: image.height }
    validateTopicImage(candidate)
    result.image = candidate
  }
  return result
}
export function restoreDocumentExtension(
  document: MindMapDocument,
  extension: SourceRecord | undefined,
): MindMapDocument {
  if (!extension) return document
  const allowed: readonly (keyof DocumentExtensions)[] = [
    'settings',
    'relations',
    'groups',
    'callouts',
    'floatingIds',
    'floatingPositions',
    'presentation',
  ]
  const fields = Object.fromEntries(
    allowed.filter((key) => extension[key] !== undefined).map((key) => [key, extension[key]]),
  )
  const candidate: unknown = { ...document, ...fields }
  validateDocument(candidate)
  return { ...document, ...documentExtensionData(candidate) }
}
