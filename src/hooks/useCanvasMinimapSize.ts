import { useLayoutEffect, useState, type RefObject } from 'react'

/** MiniMap calculates navigation scale from numeric props, so CSS sizing must reach its SVG. */
export const useCanvasMinimapSize = (container: RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const minimap = container.current?.querySelector<HTMLElement>('.react-flow__minimap')
    if (!minimap) return
    const read = () => {
      const width = minimap.clientWidth
      const height = minimap.clientHeight
      if (width <= 0 || height <= 0) return
      setSize((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      )
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(minimap)
    return () => {
      observer.disconnect()
    }
  }, [container])
  return size
}
