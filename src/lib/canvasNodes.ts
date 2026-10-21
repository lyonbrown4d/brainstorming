import { projectedInkBounds } from '@renderer/lib/spatialInk'
import type { SpatialView } from '@renderer/state/spatialView'
import type { Node } from '@xyflow/react'
import type { CanvasStroke, MindMapDocument } from '@core'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { inkGeometry } from '@shared/ink-geometry'
import {
  projectSpatialPoint,
  spatialDepthVisible,
  spatialPerspectiveScale,
} from '@renderer/lib/spatialCamera'

export type InkFlowNode = Node<
  { stroke: CanvasStroke; cameraScale?: number; cameraDepth?: number },
  'ink'
> & { type: 'ink' }
export type CanvasFlowNode = TopicFlowNode | InkFlowNode

/** Keep renderer IDs distinct even when a topic uses a stroke-like arbitrary ID. */
export const projectInk = (document: MindMapDocument, spatial?: SpatialView): InkFlowNode[] => {
  const used = new Set(Object.keys(document.topics))
  return (document.drawings ?? []).flatMap((stroke) => {
    let id = `ink:${stroke.id}`
    while (used.has(id)) id = `ink:${id}`
    used.add(id)
    const bounds = spatial ? projectedInkBounds(stroke, spatial) : inkGeometry(stroke).bounds
    const worldBounds = inkGeometry(stroke).bounds
    const cameraDepth =
      spatial?.mode === '3d'
        ? projectSpatialPoint(
            {
              x: worldBounds.x + worldBounds.width / 2,
              y: worldBounds.y + worldBounds.height / 2,
              z: stroke.spatialDepth ?? 0,
            },
            spatial,
          ).z
        : undefined
    if (spatial && cameraDepth !== undefined && !spatialDepthVisible(spatial, cameraDepth))
      return []
    return [
      {
        id,
        type: 'ink',
        ...(spatial?.mode === '3d'
          ? {
              measured: { width: Math.round(bounds.width), height: Math.round(bounds.height) },
            }
          : {}),
        data: {
          stroke,
          ...(cameraDepth === undefined || !spatial
            ? {}
            : { cameraDepth, cameraScale: spatialPerspectiveScale(spatial, cameraDepth) }),
        },
        position: { x: bounds.x, y: bounds.y },
        initialWidth: bounds.width,
        initialHeight: bounds.height,
        style: {
          width: bounds.width,
          height: bounds.height,
          pointerEvents: 'none',
        },
        draggable: true,
        selectable: true,
        connectable: false,
        zIndex: -1,
      },
    ]
  })
}
