import { referencedAssetIds } from '@core/topic-content'
import type { DocumentAsset, MindMapWorkbook } from '@core'
import { createAsset } from '@assets'
import { getAssetUrl } from '@renderer/lib/resource'

/** Only explicit interchange exports materialize bounded bytes; normal editing remains reference-only. */
export const prepareExportResources = async (
  workbook: MindMapWorkbook,
  original: boolean,
): Promise<MindMapWorkbook> => {
  const sheets = []
  let total = 0
  for (const sheet of workbook.sheets) {
    const assets: Record<string, DocumentAsset> = {}
    const referenced = referencedAssetIds(sheet.document.topics)
    const imageIds = new Set(
      Object.values(sheet.document.topics).flatMap((topic) =>
        topic.image ? [topic.image.assetId] : [],
      ),
    )
    for (const asset of Object.values(sheet.document.assets ?? {})) {
      if (!referenced.has(asset.id)) continue
      if (!asset.storage || (!original && !imageIds.has(asset.id))) {
        assets[asset.id] = asset
        continue
      }
      const useOriginal = original || !asset.storage.preview
      const length = useOriginal ? asset.storage.byteLength : asset.storage.preview.byteLength
      if (length > 8 * 1024 ** 2)
        throw new Error('交换格式导出仅支持单个 8 MiB 以内的资源，请单独另存大资源')
      total += length
      if (total > 24 * 1024 ** 2) throw new Error('交换格式的资源总量不能超过 24 MiB')
      const response = await fetch(getAssetUrl(asset, useOriginal ? 'original' : 'preview'))
      if (!response.ok) throw new Error('无法读取导出资源')
      assets[asset.id] = createAsset(
        new Uint8Array(await response.arrayBuffer()),
        asset.name,
        asset.id,
      )
    }
    sheets.push({
      ...sheet,
      document: { ...sheet.document, ...(Object.keys(assets).length ? { assets } : {}) },
    })
  }
  return { ...workbook, sheets }
}
