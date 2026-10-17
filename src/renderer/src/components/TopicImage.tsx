import { memo } from 'react'
import type { TopicImage as TopicImageData } from '@core'
import { measureTopicImage } from '@layout'
import { useEditor } from '@renderer/state/editor'

export const TopicImage = memo(
  ({ image, className }: { image: TopicImageData; className: string }) => {
    // Subscribe only to this image so edits to another topic's assets do not redraw the map.
    const asset = useEditor((state) => state.history.document.assets?.[image.assetId])
    if (!asset || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(asset.mimeType))
      return null
    const size = measureTopicImage(image)
    return (
      <img
        className={className}
        src={`data:${asset.mimeType};base64,${asset.data}`}
        alt={asset.name}
        width={size.width}
        height={size.height}
        draggable={false}
      />
    )
  },
)

TopicImage.displayName = 'TopicImage'
