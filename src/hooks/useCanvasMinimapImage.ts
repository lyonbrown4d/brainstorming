import { useEffect, useState } from 'react'
import {
  createCanvasMinimapImageLoader,
  type CanvasMinimapImageSource,
  type CanvasMinimapLoadedImage,
} from '@renderer/lib/canvasMinimapImage'

/** Native image completion publishes the view; a pending decode keeps the previous image. */
export const useCanvasMinimapImage = (
  source: CanvasMinimapImageSource,
): CanvasMinimapLoadedImage | null => {
  const [loader] = useState(createCanvasMinimapImageLoader)
  const [image, setImage] = useState<CanvasMinimapLoadedImage | null>(null)
  const supported =
    typeof Image === 'function' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
  useEffect(() => {
    if (supported) return loader.load(source, setImage)
  }, [loader, source, supported])
  useEffect(
    () => () => {
      loader.dispose()
    },
    [loader],
  )
  return supported ? image : null
}
