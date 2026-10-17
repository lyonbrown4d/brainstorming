import type { DocumentAsset } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'

export const getAssetUrl = (
  asset: DocumentAsset,
  variant: 'preview' | 'original' = 'preview',
): string => {
  if (!asset.storage) return `data:${asset.mimeType};base64,${asset.data}`
  const objectId =
    variant === 'preview'
      ? (asset.storage.preview?.objectId ?? asset.storage.objectId)
      : asset.storage.objectId
  return `${requireDesktopAPI().resourceOrigin}/object/${objectId}`
}
export const getTileUrl = (asset: DocumentAsset, level: number, x: number, y: number): string => {
  if (!asset.storage?.tiles) throw new Error('图片没有瓦片')
  return `${requireDesktopAPI().resourceOrigin}/tile/${asset.storage.objectId}/${level}/${x}/${y}`
}
