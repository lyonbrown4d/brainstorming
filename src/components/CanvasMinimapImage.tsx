import type { ReactNode } from 'react'
import { useCanvasMinimapImage } from '@renderer/hooks/useCanvasMinimapImage'
import type { CanvasMinimapImageSource } from '@renderer/lib/canvasMinimapImage'

/** The official MiniMap still owns navigation and its mask; this is only its node artwork. */
export const CanvasMinimapImage = ({
  source,
  fallback,
}: {
  source: CanvasMinimapImageSource
  fallback: ReactNode
}) => {
  const image = useCanvasMinimapImage(source)
  return image ? (
    <image
      className="react-flow__minimap-image"
      href={image.url}
      x={image.source.x}
      y={image.source.y}
      width={image.source.width}
      height={image.source.height}
      preserveAspectRatio="none"
      pointerEvents="none"
      data-minimap-node-count={image.source.count}
    />
  ) : (
    fallback
  )
}
