import { useCallback } from 'react'
import type { DocumentAsset } from '@core'
import { TiledImageViewer } from '@renderer/components/metadata/TiledImageViewer'
import { getAssetUrl, getTileUrl } from '@renderer/lib/resource'

export const StoredImageViewer = ({ asset }: { asset: DocumentAsset }) => {
  const tiles = asset.storage?.tiles
  const tileUrl = useCallback(
    (level: number, x: number, y: number) => getTileUrl(asset, level, x, y),
    [asset],
  )
  if (!tiles)
    return (
      <img
        src={getAssetUrl(asset)}
        alt={asset.name}
        className="mx-auto max-h-[65vh] max-w-full object-contain"
      />
    )
  return (
    <TiledImageViewer
      {...tiles}
      getTileUrl={tileUrl}
      previewUrl={getAssetUrl(asset)}
      className="h-[65vh]"
    />
  )
}
