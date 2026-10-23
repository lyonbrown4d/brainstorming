import type { WebGLRenderer } from 'three'
import { useEditor } from '@renderer/state/editor'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'

const canvases = new WeakMap<HTMLCanvasElement, IndependentSpatialRuntime>()
/** File drops resolve against the active 3D surface without creating DOM hit boxes. */
export const independentSpatialRuntimeAt = (x: number, y: number) => {
  const element = document.elementFromPoint(x, y)
  const canvas = element?.matches('canvas[data-spatial-canvas]') ? element : null
  return canvas instanceof HTMLCanvasElement ? canvases.get(canvas) : undefined
}
export const registerIndependentSpatialCanvas = (
  runtime: IndependentSpatialRuntime,
  renderer: WebGLRenderer,
): void => {
  const canvas = renderer.domElement
  canvases.set(canvas, runtime)
  if (import.meta.env.VITE_NATIVE_E2E !== '1') return
  // Read-only actual scene diagnostics; tests cannot execute document operations through this getter.
  const frame = () => ({
    camera: runtime.camera
      ? {
          position: runtime.camera.position.toArray(),
          quaternion: runtime.camera.quaternion.toArray(),
          matrix: runtime.camera.matrixWorld.toArray(),
        }
      : null,
    renderFrame: renderer.info.render.frame,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures,
    topicCount: runtime.model.layout.nodes.length,
    rootTitle: runtime.model.document.topics[runtime.model.document.rootId]?.title ?? '',
    input: {
      modelCurrent: runtime.model.document === useEditor.getState().history.document,
      busy: useEditor.getState().busy,
      editingId: useEditor.getState().editingId,
      selectedId: useEditor.getState().selectedId,
      navigating: runtime.navigating,
      interacting: runtime.interacting,
    },
  })
  Object.defineProperty(canvas, 'spatialFrameDiagnostics', { configurable: true, get: frame })
  Object.defineProperty(canvas, 'spatialDiagnostics', {
    configurable: true,
    get: () => ({ ...frame(), rectangles: runtime.rectangles() }),
  })
}

export const independentSpatialTopicAt = (x: number, y: number): string | undefined => {
  const hit = independentSpatialRuntimeAt(x, y)?.pick(x, y)
  return hit?.kind === 'topic' ? hit.id : undefined
}
