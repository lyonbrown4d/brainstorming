import { formatHex, parse } from 'culori'
import type { MinimapPathGroup, MinimapRectangle } from '@renderer/lib/canvasMinimapBatch'

export interface CanvasMinimapImageSource {
  readonly markup: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly count: number
}
export interface CanvasMinimapLoadedImage {
  readonly url: string
  readonly source: CanvasMinimapImageSource
}

/** Serialize only generated finite paths and canonical opaque colors into the SVG image. */
export const canvasMinimapImageSource = (
  groups: readonly MinimapPathGroup[],
  rectangles: readonly MinimapRectangle[],
  shapeRendering: string,
): CanvasMinimapImageSource | null => {
  if (!groups.length || !rectangles.length) return null
  let x = Infinity
  let y = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rectangle of rectangles) {
    const edgeX = rectangle.x + rectangle.width
    const edgeY = rectangle.y + rectangle.height
    if (
      rectangle.width <= 0 ||
      rectangle.height <= 0 ||
      ![rectangle.x, rectangle.y, edgeX, edgeY].every(Number.isFinite)
    )
      return null
    x = Math.min(x, rectangle.x)
    y = Math.min(y, rectangle.y)
    right = Math.max(right, edgeX)
    bottom = Math.max(bottom, edgeY)
  }
  const width = right - x
  const height = bottom - y
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  const paths: string[] = []
  let count = 0
  for (const group of groups) {
    const color = parse(group.fill)
    const fill = color && (color.alpha ?? 1) === 1 ? formatHex(color) : undefined
    const numbers = group.path.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)
    if (
      !fill ||
      !/^[MHVAZ0-9eE.,+\s-]+$/.test(group.path) ||
      !numbers?.every((value) => Number.isFinite(Number(value)))
    )
      return null
    paths.push(`<path fill="${fill}" d="${group.path}"/>`)
    count += group.count
  }
  const rendering = shapeRendering === 'crispEdges' ? 'crispEdges' : 'geometricPrecision'
  return {
    x,
    y,
    width,
    height,
    count,
    markup:
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" ` +
      `viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="none" shape-rendering="${rendering}">` +
      paths.join('') +
      '</svg>',
  }
}

export interface CanvasMinimapImageEnvironment {
  readonly createUrl: (markup: string) => string
  readonly revokeUrl: (url: string) => void
  readonly decode: (url: string, loaded: () => void, failed: () => void) => () => void
  readonly defer: (callback: () => void) => void
}
const browserEnvironment: CanvasMinimapImageEnvironment = {
  createUrl: (markup) => URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' })),
  revokeUrl: (url) => {
    URL.revokeObjectURL(url)
  },
  decode: (url, loaded, failed) => {
    const image = new Image()
    image.onload = loaded
    image.onerror = failed
    image.src = url
    return () => {
      image.onload = null
      image.onerror = null
      image.src = ''
    }
  },
  defer: (callback) => {
    queueMicrotask(callback)
  },
}

/** One latest decoder request and one previously loaded image; cleanup owns every object URL. */
export const createCanvasMinimapImageLoader = (
  environment: CanvasMinimapImageEnvironment = browserEnvironment,
) => {
  let revision = 0
  let pending: { url: string; stop: () => void } | null = null
  let current: CanvasMinimapLoadedImage | null = null
  const cancelPending = () => {
    if (!pending) return
    pending.stop()
    environment.revokeUrl(pending.url)
    pending = null
  }
  const clearCurrent = () => {
    if (current) environment.revokeUrl(current.url)
    current = null
  }
  return {
    load: (
      source: CanvasMinimapImageSource,
      publish: (image: CanvasMinimapLoadedImage | null) => void,
    ) => {
      cancelPending()
      const token = ++revision
      let settled = false
      const failed = () => {
        if (token !== revision || settled) return
        settled = true
        cancelPending()
        clearCurrent()
        publish(null)
      }
      try {
        const url = environment.createUrl(source.markup)
        pending = { url, stop: () => undefined }
        const stop = environment.decode(
          url,
          () => {
            if (token !== revision || settled) return
            settled = true
            pending?.stop()
            pending = null
            clearCurrent()
            current = { url, source }
            publish(current)
          },
          failed,
        )
        // Native load/error events run asynchronously, after decoder setup finishes.
        pending.stop = stop
      } catch {
        // Resource/decoder setup errors publish asynchronously, just like native error events.
        environment.defer(failed)
      }
      return () => {
        if (token !== revision) return
        revision++
        cancelPending()
      }
    },
    dispose: () => {
      revision++
      cancelPending()
      clearCurrent()
    },
  }
}
