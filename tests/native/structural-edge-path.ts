import { browser } from '@wdio/globals'
import type { DenseEdgeGpuCanvas } from '@renderer/lib/denseEdgeGpuTypes'

/** Read the submitted GPU scene or actual SVG screen geometry for this branch. */
export const nativeStructuralEdgePath = async (edgeId?: string): Promise<string> =>
  browser.execute((id) => {
    const gpu = document.querySelector<DenseEdgeGpuCanvas>(
      '[data-gpu-edge-active="true"] canvas[data-gpu-edge-ready="true"]',
    )
    if (gpu?.edgeDiagnostics) {
      const point = gpu.edgeDiagnostics.source(id)
      return point ? JSON.stringify(point) : ''
    }
    const direct = id
      ? document.querySelector(
          `.react-flow__edge[data-id="${CSS.escape(id)}"] path.react-flow__edge-path`,
        )
      : document.querySelector('[data-testid="structural-edge-layer"] path.react-flow__edge-path')
    if (direct instanceof SVGPathElement) {
      const point = direct.getPointAtLength(0)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(
        direct.getScreenCTM() ?? undefined,
      )
      return JSON.stringify({ x: screen.x, y: screen.y })
    }
    for (const path of document.querySelectorAll('path[data-structural-edge-ids]')) {
      const ids: unknown = JSON.parse(path.getAttribute('data-structural-edge-ids') ?? '[]')
      if (!Array.isArray(ids)) continue
      const index = ids.indexOf(id)
      if (index < 0) continue
      const data = path
        .getAttribute('d')
        ?.match(/M[^M]*/g)
        ?.[index]?.trim()
      if (!data || !(path instanceof SVGPathElement)) return ''
      const curve = path.cloneNode() as SVGPathElement
      curve.setAttribute('d', data)
      const point = curve.getPointAtLength(0)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(
        path.getScreenCTM() ?? undefined,
      )
      return JSON.stringify({ x: screen.x, y: screen.y })
    }
    return ''
  }, edgeId)
