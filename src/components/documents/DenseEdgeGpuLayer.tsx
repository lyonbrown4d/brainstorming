import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDebounceEffect, useMemoizedFn } from 'ahooks'
import { useErrorBoundary } from 'react-error-boundary'
import { createDenseEdgeGpuScene, type DenseEdgeGpuScene } from '@renderer/lib/denseEdgeGpuScene'
import type { DenseEdgeGpuCanvas, DenseEdgeGpuInput } from '@renderer/lib/denseEdgeGpuTypes'

/** Lazily initialized, demand-rendered WebGL; SVG remains visible until the first submitted frame. */
const DenseEdgeGpuLayer = (
  props: DenseEdgeGpuInput & {
    onReady: (ready: boolean) => void
    active: boolean
    rendering: boolean
  },
) => {
  const host = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<DenseEdgeGpuScene | null>(null)
  const painted = useRef(false)
  const { showBoundary } = useErrorBoundary()
  const [available, setAvailable] = useState(true)
  const [generation, setGeneration] = useState(0)
  const publish = useMemoizedFn(props.onReady)
  useEffect(() => {
    const parent = host.current
    if (!parent) return
    // Each effect lifetime owns a distinct canvas, including StrictMode mount replay.
    const target = document.createElement('canvas') as DenseEdgeGpuCanvas
    target.setAttribute('aria-hidden', 'true')
    target.dataset.testid = 'structural-edge-layer'
    target.dataset.structuralEdgeRenderer = 'gpu'
    target.className = 'pointer-events-none absolute top-0 left-0'
    parent.appendChild(target)
    let cancelled = false
    let current: DenseEdgeGpuScene | null = null
    const lost = () => {
      delete target.dataset.gpuEdgeReady
      setAvailable(false)
      publish(false)
    }
    const restored = () => {
      painted.current = false
      setAvailable(true)
      setGeneration((value) => value + 1)
    }
    target.addEventListener('webglcontextlost', lost)
    target.addEventListener('webglcontextrestored', restored)
    void createDenseEdgeGpuScene(target)
      .then((next) => {
        if (cancelled) next.destroy()
        else {
          current = next
          setScene(next)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          target.remove()
          publish(false)
          console.warn('Dense edge WebGL initialization failed', error)
        }
      })
    return () => {
      cancelled = true
      target.removeEventListener('webglcontextlost', lost)
      target.removeEventListener('webglcontextrestored', restored)
      current?.destroy()
      target.remove()
    }
  }, [publish])
  const draw = useMemoizedFn(() => {
    if (!scene || !available) return
    try {
      if (scene.render(props, !painted.current)) {
        painted.current = true
        publish(true)
      }
    } catch (error) {
      publish(false)
      showBoundary(error)
    }
  })
  useLayoutEffect(() => {
    if (props.rendering || !painted.current) draw()
  }, [scene, props, draw, generation, available])
  // Keep navigation on SVG; warm buffers once the viewport settles for the next drag.
  useDebounceEffect(
    () => {
      if (!props.rendering) draw()
    },
    [scene, props, generation, available, draw],
    { wait: 200 },
  )

  return (
    <div
      ref={host}
      aria-hidden
      data-gpu-edge-active={props.active}
      className={`pointer-events-none absolute top-0 left-0 z-[1] ${props.active ? '' : 'invisible'}`}
    />
  )
}
export default DenseEdgeGpuLayer
