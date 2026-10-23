import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'

/** Keyboard navigation preserves the camera while the chosen topic is comfortably visible. */
export const independentSpatialCameraNeedsFocus = (
  rect: SpatialSceneRect | undefined,
  bounds: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
): boolean =>
  !rect ||
  rect.x < bounds.left + 24 ||
  rect.y < bounds.top + 24 ||
  rect.x + rect.width > bounds.right - 24 ||
  rect.y + rect.height > bounds.bottom - 24
