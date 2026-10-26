// Official static uniform/shader synchronization for Tauri's strict CSP.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, GraphicsPath, Matrix } from 'pixi.js'
import type { DenseEdgeGpuCanvas, DenseEdgeGpuInput } from '@renderer/lib/denseEdgeGpuTypes'
import type { DenseStructuralEdge } from '@renderer/lib/denseStructuralEdgePaths'

/** Current visible curves only; geometry buffers and the WebGL context belong to this canvas. */
export const createDenseEdgeGpuScene = async (canvas: DenseEdgeGpuCanvas) => {
  const app = new Application()
  try {
    await app.init({
      canvas,
      preference: 'webgl',
      width: 1,
      height: 1,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      autoStart: false,
      sharedTicker: false,
      eventMode: 'none',
      powerPreference: 'high-performance',
    })
  } catch (error) {
    try {
      app.destroy(false, { children: true })
    } catch {
      /* Context creation can fail before a renderer exists. */
    }
    throw error
  }
  const world = new Container({ eventMode: 'none', isRenderGroup: true })
  app.stage.addChild(world)
  const curves = new Map<string, { entry: DenseStructuralEdge; graphic: Graphics }>()
  let revision = 0
  let width = 0,
    height = 0,
    resolution = 0
  let submitted: DenseEdgeGpuInput | null = null
  const render = (input: DenseEdgeGpuInput, force = false) => {
    if (
      !force &&
      submitted?.entries === input.entries &&
      submitted.transform === input.transform &&
      submitted.width === input.width &&
      submitted.height === input.height &&
      resolution === devicePixelRatio
    )
      return true
    if (input.width <= 0 || input.height <= 0) return false
    if (width !== input.width || height !== input.height || resolution !== devicePixelRatio) {
      width = input.width
      height = input.height
      resolution = devicePixelRatio
      app.renderer.resize(width, height, resolution)
    }
    const visible = new Set(input.entries.map((entry) => entry.edge.id))
    for (const [id, cached] of curves) {
      if (!visible.has(id)) {
        cached.graphic.destroy({ context: true })
        curves.delete(id)
      }
    }
    input.entries.forEach((entry, index) => {
      let cached = curves.get(entry.edge.id)
      if (!cached) {
        cached = { entry, graphic: new Graphics({ eventMode: 'none' }) }
        curves.set(entry.edge.id, cached)
        // Our validated opaque curves are safe to batch even beyond Pixi's auto threshold.
        cached.graphic.context.batchMode = 'batch'
        world.addChild(cached.graphic)
        draw(cached.graphic, entry)
      } else {
        if (
          cached.entry.path !== entry.path ||
          cached.entry.edge.style?.stroke !== entry.edge.style?.stroke ||
          cached.entry.edge.style?.strokeWidth !== entry.edge.style?.strokeWidth
        )
          draw(cached.graphic, entry)
        cached.entry = entry
      }
      if (world.children[index] !== cached.graphic) world.setChildIndex(cached.graphic, index)
    })
    const [x, y, zoom] = input.transform
    world.position.set(x, y)
    world.scale.set(zoom)
    app.render()
    submitted = input
    const matrix = world.getGlobalTransform(new Matrix())
    // Diagnostics read the last submitted scene, not pending React or document coordinates.
    canvas.edgeDiagnostics = {
      frame: ++revision,
      edges: input.entries.length,
      source: (id) => {
        const entry = id ? curves.get(id)?.entry : input.entries[0]
        if (!entry) return null
        const point = matrix.apply({ x: entry.geometry.sourceX, y: entry.geometry.sourceY })
        const bounds = canvas.getBoundingClientRect()
        return { x: bounds.left + point.x, y: bounds.top + point.y }
      },
    }
    canvas.dataset.gpuEdgeReady = 'true'
    return true
  }
  const destroy = () => {
    delete canvas.edgeDiagnostics
    delete canvas.dataset.gpuEdgeReady
    for (const { graphic } of curves.values()) graphic.destroy({ context: true })
    curves.clear()
    app.destroy(false, { children: true })
  }
  return { render, destroy }
}

const draw = (graphic: Graphics, entry: DenseStructuralEdge) => {
  const color = entry.edge.style?.stroke,
    width = entry.edge.style?.strokeWidth
  if (typeof color !== 'string' || typeof width !== 'number')
    throw new Error('Invalid GPU curve style')
  graphic
    .clear()
    .path(new GraphicsPath(entry.path))
    .stroke({ color, width, cap: 'butt', join: 'miter' })
}
export type DenseEdgeGpuScene = Awaited<ReturnType<typeof createDenseEdgeGpuScene>>
