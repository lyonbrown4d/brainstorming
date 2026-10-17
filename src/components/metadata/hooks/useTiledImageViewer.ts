import { useEffect, useRef, useState } from 'react'
import type { Viewer } from 'openseadragon'

export interface TiledImageSource {
  width: number
  height: number
  tileSize: number
  overlap: number
  maxLevel: number
  getTileUrl: (level: number, x: number, y: number) => string
}

type ViewerStatus = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }

/** Owns the OpenSeadragon widget and releases all tile, mouse and resize subscriptions. */
export const useTiledImageViewer = ({
  width,
  height,
  tileSize,
  overlap,
  maxLevel,
  getTileUrl,
}: TiledImageSource) => {
  const container = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const [status, setStatus] = useState<ViewerStatus>({ state: 'loading' })

  useEffect(() => {
    const element = container.current
    if (!element) return
    let disposed = false
    let instance: Viewer | undefined
    setStatus({ state: 'loading' })
    const open = async () => {
      // Load the deep zoom library only when a tiled preview is opened.
      const { default: OpenSeadragon } = await import('openseadragon')
      if (disposed) return
      const source = new OpenSeadragon.TileSource({
        width,
        height,
        tileSize,
        tileOverlap: overlap,
        minLevel: 0,
        maxLevel,
      })
      source.getTileUrl = getTileUrl
      // WebP can contain alpha. Let the drawer clear tiles instead of leaving stale pixels.
      source.hasTransparency = () => true
      instance = OpenSeadragon({
        element,
        showNavigationControl: false,
        showNavigator: false,
        showFullPageControl: false,
        animationTime: 0.2,
        blendTime: 0.1,
        imageLoaderLimit: 4,
        maxImageCacheCount: 100,
        maxZoomPixelRatio: 4,
        visibilityRatio: 0.5,
        constrainDuringPan: true,
        crossOriginPolicy: false,
        drawer: 'canvas',
      })
      viewer.current = instance
      instance.addHandler('tile-loaded', () => {
        if (!disposed)
          setStatus((current) => (current.state === 'ready' ? current : { state: 'ready' }))
      })
      instance.addHandler('open-failed', (event) => {
        if (!disposed) setStatus({ state: 'error', message: event.message })
      })
      instance.addHandler('tile-load-failed', (event) => {
        if (!disposed && event.maxReached) {
          setStatus({ state: 'error', message: event.message })
        }
      })
      instance.open({ tileSource: source })
    }
    void open().catch((error: unknown) => {
      if (!disposed) {
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return () => {
      disposed = true
      viewer.current = null
      instance?.destroy()
    }
  }, [width, height, tileSize, overlap, maxLevel, getTileUrl])

  const zoom = (factor: number) => {
    const viewport = viewer.current?.viewport
    viewport?.zoomBy(factor)
    viewport?.applyConstraints()
  }
  const fit = () => viewer.current?.viewport.goHome()
  return { container, status, zoom, fit }
}
