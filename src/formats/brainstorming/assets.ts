import type { MindMapWorkbook } from '@core'
import { assetBytes, createAsset, imageDimensions } from '@assets'
import { AUDIO_MIME_TYPES, referencedAssetIds } from '@core/topic-content'
import { storedMetadata } from '@main/document-db/types'

/** Only inline imports carry bytes here; stored objects are checked by the native object store. */
export const validateAssetContent = (workbook: MindMapWorkbook): void => {
  for (const { document } of workbook.sheets) {
    for (const id of referencedAssetIds(document.topics)) {
      const asset = document.assets?.[id]
      if (!asset) throw new Error('Brainstorming 主题引用的资源不存在')
      if (storedMetadata(asset)) continue
      const normalized = createAsset(assetBytes(asset), asset.name, asset.id)
      const sameMime =
        asset.mimeType === normalized.mimeType ||
        (asset.mimeType === 'application/octet-stream' &&
          (AUDIO_MIME_TYPES as readonly string[]).includes(normalized.mimeType))
      if (!sameMime || normalized.name !== asset.name)
        throw new Error('Brainstorming 资源类型或名称与实际内容不一致')
    }
    for (const topic of Object.values(document.topics)) {
      if (!topic.image) continue
      const asset = document.assets?.[topic.image.assetId]
      if (!asset) throw new Error('Brainstorming 图片资源不存在')
      if (storedMetadata(asset)) continue
      const dimensions = imageDimensions(asset)
      if (dimensions.width !== topic.image.width || dimensions.height !== topic.image.height)
        throw new Error('Brainstorming 图片尺寸与实际内容不一致')
    }
  }
}

/** XMind import budgets are independent of the native SQLite resource store. */
export const ASSET_LIMITS = { entry: 8 * 1024 * 1024, total: 24 * 1024 * 1024 } as const
