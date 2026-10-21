import type { CanvasStroke } from '@core'
import type { SpatialView } from '@renderer/state/spatialView'
import {
  projectSpatialPoint,
  spatialPerspectiveScale,
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
