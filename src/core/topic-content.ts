import type { DocumentAsset, MindMapDocument, Topic, TopicImage } from './types'

export const MAX_ASSET_BYTES = 8 * 1024 * 1024
export const MAX_DOCUMENT_ASSET_BYTES = 24 * 1024 * 1024
export const MAX_TOPIC_NOTES_LENGTH = 100_000
export const MAX_TOPIC_ATTACHMENTS = 32
export const MAX_IMAGE_DIMENSION = 8192
export const MAX_IMAGE_PIXELS = 40_000_000

const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor'])
const mimePattern = /^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const validatedAssets = new WeakMap<object, DocumentAsset>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}

export function assertAssetId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value) || forbiddenIds.has(value))
    throw new Error('资源 ID 无效')
}

/** Validate canonical padding and unused tail bits without allocating decoded byte arrays. */
function assetByteLength(data: unknown): number {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4)
    throw new Error('资源超过 8 MiB 或编码无效')
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw new Error('资源必须使用规范的 base64 编码')
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  const tail = base64Alphabet.indexOf(data.charAt(data.length - padding - 1))
  if ((padding === 2 && tail % 16 !== 0) || (padding === 1 && tail % 4 !== 0))
    throw new Error('资源必须使用规范的 base64 编码')
  const length = (data.length / 4) * 3 - padding
  if (length > MAX_ASSET_BYTES) throw new Error('资源超过 8 MiB')
  return length
}

export function validateDocumentAsset(value: unknown): asserts value is DocumentAsset {
  if (!isRecord(value)) throw new Error('资源格式无效')
  const cached = validatedAssets.get(value)
  if (
    cached &&
    cached.id === value.id &&
    cached.name === value.name &&
    cached.mimeType === value.mimeType &&
    cached.data === value.data
  )
    return
  assertAssetId(value.id)
  if (
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    value.name.length > 255 ||
    /[\p{Cc}/\\]/u.test(value.name)
  )
    throw new Error('资源文件名无效')
  if (
    typeof value.mimeType !== 'string' ||
    value.mimeType.length > 127 ||
    !mimePattern.test(value.mimeType)
  )
    throw new Error('资源 MIME 类型无效')
  assetByteLength(value.data)
  validatedAssets.set(value, {
    id: value.id,
    name: value.name,
    mimeType: value.mimeType,
    data: value.data as string,
  })
}

export function validateTopicNotes(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_TOPIC_NOTES_LENGTH)
    throw new Error('备注须为不超过 100000 字符的文本')
}

export function validateTopicImage(value: unknown): asserts value is TopicImage {
  if (!isRecord(value)) throw new Error('主题图片格式无效')
  assertAssetId(value.assetId)
  const { width, height } = value
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error('主题图片尺寸无效')
}

export function validateTopicContent(topic: Record<string, unknown>): void {
  if (Object.hasOwn(topic, 'notes')) validateTopicNotes(topic.notes)
  if (Object.hasOwn(topic, 'image')) validateTopicImage(topic.image)
  if (Object.hasOwn(topic, 'attachments')) {
    const attachments = topic.attachments
    if (!Array.isArray(attachments) || attachments.length > MAX_TOPIC_ATTACHMENTS)
      throw new Error('每个主题最多添加 32 个附件')
    for (const id of attachments) assertAssetId(id)
    if (new Set(attachments).size !== attachments.length) throw new Error('主题附件重复')
  }
}

export function referencedAssetIds(topics: Readonly<Record<string, Topic>>): Set<string> {
  const ids = new Set<string>()
  for (const topic of Object.values(topics)) {
    if (topic.image) ids.add(topic.image.assetId)
    for (const id of topic.attachments ?? []) ids.add(id)
  }
  return ids
}

export function validateDocumentContent(
  value: Record<string, unknown>,
  topics: Readonly<Record<string, Topic>>,
): void {
  const assets = Object.hasOwn(value, 'assets') ? value.assets : {}
  if (!isRecord(assets)) throw new Error('文档资源列表无效')
  const sizes = new Map<string, number>()
  for (const [id, asset] of Object.entries(assets)) {
    validateDocumentAsset(asset)
    if (asset.id !== id) throw new Error('资源 ID 与索引不一致')
    sizes.set(
      id,
      (asset.data.length / 4) * 3 -
        (asset.data.endsWith('==') ? 2 : asset.data.endsWith('=') ? 1 : 0),
    )
  }
  let total = 0
  for (const id of referencedAssetIds(topics)) {
    const size = sizes.get(id)
    if (size === undefined) throw new Error(`资源 ${id} 不存在`)
    total += size
  }
  if (total > MAX_DOCUMENT_ASSET_BYTES) throw new Error('文档资源总量超过 24 MiB')
  for (const topic of Object.values(topics)) {
    if (topic.image) {
      const asset = assets[topic.image.assetId] as DocumentAsset
      if (!imageMimeTypes.has(asset.mimeType)) throw new Error('主题图片格式不受支持')
    }
  }
}

export function assetData(asset: DocumentAsset): DocumentAsset {
  const result = { id: asset.id, name: asset.name, mimeType: asset.mimeType, data: asset.data }
  const cached = validatedAssets.get(asset)
  if (cached) validatedAssets.set(result, cached)
  return result
}

export function documentAssetsData(
  document: MindMapDocument,
  preserveUnused = false,
): Readonly<Record<string, DocumentAsset>> | undefined {
  const ids = preserveUnused
    ? Object.keys(document.assets ?? {})
    : referencedAssetIds(document.topics)
  const assets: Record<string, DocumentAsset> = {}
  for (const id of ids) {
    const asset = document.assets?.[id]
    if (asset && Object.hasOwn(document.assets ?? {}, id)) assets[id] = assetData(asset)
  }
  return Object.keys(assets).length > 0 ? assets : undefined
}
