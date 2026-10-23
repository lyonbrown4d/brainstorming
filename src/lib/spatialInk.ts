import type { CanvasStroke, MindMapDocument } from '@core'
import type { InkFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'
import {
  projectSpatialPoint,
  spatialPerspectiveScale,
  spatialDepthVisible,
  unprojectSpatialPoint,
} from '@renderer/lib/spatialCamera'
import { inkGeometry, transformInk, type InkBounds } from '@shared/ink-geometry'

/** Ink is a camera-facing annotation, just like a topic card. Its samples stay unchanged. */
export const projectedInkBounds = (stroke: CanvasStroke, view: SpatialView): InkBounds => {
  const bounds = inkGeometry(stroke).bounds
  if (view.mode === '2d') return bounds
  const center = projectSpatialPoint(
    {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      z: stroke.spatialDepth ?? 0,
    },
    view,
  )
  const scale = spatialPerspectiveScale(view, center.z)
  const width = bounds.width * scale
  const height = bounds.height * scale
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

/** Place sampled screen-space ink at one world-space camera plane. */
export const placeSpatialInk = (
  stroke: CanvasStroke,
  view: SpatialView,
  cameraDepth = 0,
): CanvasStroke => {
  if (view.mode === '2d') return stroke
  const bounds = inkGeometry(stroke).bounds
  const center = unprojectSpatialPoint(
    {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      z: cameraDepth,
    },
    view,
  )
  const scale = spatialPerspectiveScale(view, cameraDepth)
  return {
    ...transformInk(stroke, bounds, {
      x: center.x - bounds.width / (2 * scale),
      y: center.y - bounds.height / (2 * scale),
      width: bounds.width / scale,
      height: bounds.height / scale,
    }),
    spatialDepth: center.z,
  }
}

export const resizeSpatialInk = (
  stroke: CanvasStroke,
  bounds: InkBounds,
  view: SpatialView,
): CanvasStroke => {
  const source = inkGeometry(stroke).bounds
  if (view.mode === '2d') return transformInk(stroke, source, bounds)
  const depth = projectSpatialPoint(
    {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
      z: stroke.spatialDepth ?? 0,
    },
    view,
  ).z
  const center = unprojectSpatialPoint(
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, z: depth },
    view,
  )
  const scale = spatialPerspectiveScale(view, depth)
  const width = bounds.width / scale
  const height = bounds.height / scale
  return {
    ...transformInk(stroke, source, {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    }),
    spatialDepth: center.z,
  }
}

/** Legacy projection reference for focused math tests; production Three ink uses its own scene. */
export const projectSpatialInk = (
  document: MindMapDocument,
  spatial?: SpatialView,
): InkFlowNode[] => {
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
