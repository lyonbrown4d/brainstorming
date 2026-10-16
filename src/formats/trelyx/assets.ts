import type { DocumentAsset, MindMapDocument, MindMapWorkbook } from '../../core'
import { assetBytes, createAsset, imageDimensions } from '../../assets'
import { AUDIO_MIME_TYPES } from '../../core/topic-content'
import { referencedAssetIds } from '../../core/topic-content'
import { onlyKeys, record } from './validation'

function samePortableMime(declared: string, detected: string): boolean {
  // Earlier v1 files stored every non-raster attachment as opaque bytes, including audio.
  return (
    declared === detected ||
    (declared === 'application/octet-stream' &&
      (AUDIO_MIME_TYPES as readonly string[]).includes(detected))
  )
}

export const ASSET_LIMITS = { entry: 8 * 1024 * 1024, total: 24 * 1024 * 1024 } as const

/** Verify actual image bytes, MIME and dimensions before accepting or saving content. */
export function validateAssetContent(workbook: MindMapWorkbook): void {
  let size = 0
  for (const { document } of workbook.sheets) {
    for (const id of referencedAssetIds(document.topics)) {
      const asset = document.assets?.[id]
      if (!asset) throw new Error('Trelyx 主题引用的资源不存在')
      const bytes = assetBytes(asset)
      if (bytes.length > ASSET_LIMITS.entry) throw new Error('Trelyx 单个资源超过 8 MiB 限制')
      size += bytes.length
      if (size > ASSET_LIMITS.total) throw new Error('Trelyx 资源合计超过 24 MiB 限制')
      const normalized = createAsset(bytes, asset.name, asset.id)
      if (!samePortableMime(asset.mimeType, normalized.mimeType) || normalized.name !== asset.name)
        throw new Error('Trelyx 资源类型或名称与实际内容不一致')
    }
    for (const topic of Object.values(document.topics)) {
      if (!topic.image) continue
      const asset = document.assets?.[topic.image.assetId]
      if (!asset) throw new Error('Trelyx 图片资源不存在')
      const dimensions = imageDimensions(asset)
      if (dimensions.width !== topic.image.width || dimensions.height !== topic.image.height)
        throw new Error('Trelyx 图片尺寸与实际内容不一致')
    }
  }
}

export function encodeAssets(
  document: MindMapDocument,
  index: number,
  entries: Record<string, Uint8Array>,
): Record<string, Omit<DocumentAsset, 'data'> & { path: string }> | undefined {
  const metadata: Record<string, Omit<DocumentAsset, 'data'> & { path: string }> = {}
  for (const id of referencedAssetIds(document.topics)) {
    const asset = document.assets?.[id]
    if (!asset) throw new Error('Trelyx 主题引用的资源不存在')
    const path = `assets/${index}/${id}`
    entries[path] = assetBytes(asset)
    metadata[id] = { id, name: asset.name, mimeType: asset.mimeType, path }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function decodeAssets(
  value: unknown,
  index: number,
  entries: ReadonlyMap<string, Uint8Array>,
  used: Set<string>,
  budget: { bytes: number },
): Record<string, DocumentAsset> {
  const assets = record(value)
  const result: Record<string, DocumentAsset> = {}
  for (const [id, value] of Object.entries(assets)) {
    const metadata = record(value)
    onlyKeys(metadata, ['id', 'name', 'mimeType', 'path'])
    const path = `assets/${index}/${id}`
    if (
      metadata.id !== id ||
      metadata.path !== path ||
      typeof metadata.name !== 'string' ||
      typeof metadata.mimeType !== 'string'
    )
      throw new Error('Trelyx 资源元数据或路径无效')
    const bytes = entries.get(path)
    if (!bytes) throw new Error('Trelyx 资源文件缺失')
    if (bytes.length > ASSET_LIMITS.entry) throw new Error('Trelyx 单个资源超过 8 MiB 限制')
    budget.bytes += bytes.length
    if (budget.bytes > ASSET_LIMITS.total) throw new Error('Trelyx 资源合计超过 24 MiB 限制')
    const detected = createAsset(bytes, metadata.name, id)
    const asset =
      metadata.mimeType === 'application/octet-stream' &&
      samePortableMime(metadata.mimeType, detected.mimeType)
        ? { ...detected, mimeType: metadata.mimeType }
        : detected
    if (asset.name !== metadata.name || asset.mimeType !== metadata.mimeType)
      throw new Error('Trelyx 资源类型或名称与实际内容不一致')
    Object.defineProperty(result, id, { value: asset, enumerable: true })
    used.add(path)
  }
  return result
}

export function assertUsedAssets(workbook: MindMapWorkbook): void {
  for (const { document } of workbook.sheets) {
    const referenced = referencedAssetIds(document.topics)
    if (Object.keys(document.assets ?? {}).some((id) => !referenced.has(id)))
      throw new Error('Trelyx 包含未引用的资源')
  }
}
