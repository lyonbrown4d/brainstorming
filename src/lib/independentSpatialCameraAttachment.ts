import type { PerspectiveCamera } from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'

/** Attach the native renderer as an external mutable resource with identity-safe cleanup. */
export const attachIndependentSpatialCamera = (
  runtime: IndependentSpatialRuntime,
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  invalidate: () => void,
): (() => void) => {
  runtime.camera = camera
  runtime.canvas = canvas
  runtime.invalidate = invalidate
  return () => {
    if (runtime.camera === camera) runtime.camera = null
    if (runtime.canvas === canvas) runtime.canvas = null
    if (runtime.invalidate === invalidate) runtime.invalidate = () => undefined
  }
}
