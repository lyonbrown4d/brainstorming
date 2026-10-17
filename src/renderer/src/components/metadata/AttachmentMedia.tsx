import { useState } from 'react'
import type { DocumentAsset } from '@core'
import { getAssetUrl } from '@renderer/lib/resource'

export const AttachmentMedia = ({ asset }: { asset: DocumentAsset }) => {
  const [failed, setFailed] = useState(false)
  if (!asset.mimeType.startsWith('video/')) return null
  return (
    <div className="basis-full pt-2">
      {/* Local user media has no accompanying caption track. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        controls
        preload="metadata"
        src={getAssetUrl(asset, 'original')}
        aria-label={asset.name}
        className="max-h-56 w-full rounded-md bg-muted"
        onError={() => {
          setFailed(true)
        }}
      />
      {failed && (
        <p role="status" className="py-1 text-xs text-muted-foreground">
          {asset.mimeType} · {asset.name}
        </p>
      )}
    </div>
  )
}
