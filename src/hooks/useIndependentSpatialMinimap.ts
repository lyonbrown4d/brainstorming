import { useLayoutEffect, useRef } from 'react'
import { useMemoizedFn } from 'ahooks'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { bindIndependentSpatialMinimapQueue } from '@renderer/lib/independentSpatialMinimapQueue'
import {
  independentSpatialMinimapGeometry,
  independentSpatialMinimapTopic,
  type IndependentMinimapGeometry,
} from '@renderer/lib/independentSpatialMinimapGeometry'
import { bindIndependentSpatialMinimapInput } from '@renderer/lib/independentSpatialMinimapInput'
import { paintIndependentSpatialMinimap } from '@renderer/lib/independentSpatialMinimapPaint'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'
import { requestSpatialCamera } from '@renderer/state/spatialCameraCommands'
import { documentAppearance, topicAppearance } from '@shared/appearance'

/** Keep projection and bitmap updates outside the perspective camera's input/render frames. */
export const useIndependentSpatialMinimap = (
  runtime: IndependentSpatialRuntime,
  enabled: boolean,
  current = true,
) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewportMask = useRef<SVGPathElement>(null)
  const navigating = useRef(false)
  const geometry = useRef<IndependentMinimapGeometry | null>(null)
  const bounds = useRef<DOMRect | null>(null)
  const refresh = useRef<() => void>(() => undefined)
  const blocked = useMemoizedFn(
    () => !current || runtime.interacting || Boolean(useCanvasInteraction.getState().drag),
  )
  const interacting = useMemoizedFn(() => navigating.current || blocked())
  const updateViewport = useMemoizedFn((dx: number, dy: number) => {
    const shown = geometry.current
    const mask = viewportMask.current
    if (!shown || !mask) return
    const { viewport } = shown.snapshot
    const left = shown.x + viewport.x * shown.scale + dx
    const top = shown.y + viewport.y * shown.scale + dy
    const width = viewport.width * shown.scale
    const height = viewport.height * shown.scale
    mask.setAttribute(
      'd',
      `M0,0H${shown.width}V${shown.height}H0Z M${left},${top}h${width}v${height}h${-width}Z`,
    )
    mask.setAttribute('fill', shown.snapshot.background)
    mask.setAttribute('stroke', shown.snapshot.foreground)
  })
  const focus = useMemoizedFn((point?: { x: number; y: number }) => {
    if (!enabled || interacting()) return
    const shown = geometry.current
    const box = canvas.current?.getBoundingClientRect()
    if (!shown || !box) return
    const id = independentSpatialMinimapTopic(
      shown,
      point
        ? { x: point.x - box.left, y: point.y - box.top }
        : { x: shown.width / 2, y: shown.height / 2 },
    )
    if (id && runtime.model.document.topics[id])
      requestSpatialCamera({ kind: 'focusTopic', topicId: id })
  })
  useLayoutEffect(() => {
    refresh.current()
  }, [current])
  useLayoutEffect(() => {
    const element = canvas.current
    if (!enabled || !element) return
    bounds.current = element.getBoundingClientRect()
    const queue = bindIndependentSpatialMinimapQueue(
      {
        interacting,
        subscribe: runtime.subscribe,
        subscribeInteraction: (callback) => useCanvasInteraction.subscribe(callback),
        read: () => {
          const viewport = runtime.canvas?.getBoundingClientRect()
          if (!viewport || viewport.width <= 0 || viewport.height <= 0) return null
          const rectangles = runtime.rectangles()
          const model = runtime.model
          const colors = new Map<string, string>()
          const ink = new Map(
            (model.document.drawings ?? []).map((stroke) => [stroke.id, stroke.color]),
          )
          for (const rect of rectangles) {
            if (rect.kind === 'ink') colors.set(rect.id, ink.get(rect.drawingId) ?? '#777777')
            else {
              const appearance = topicAppearance(model.document, rect.id, model.surface)
              colors.set(
                rect.id,
                rect.id === model.document.rootId ? appearance.fill : appearance.stroke,
              )
            }
          }
          const appearance = documentAppearance(model.document, model.surface)
          return {
            rectangles,
            viewport: {
              x: viewport.left,
              y: viewport.top,
              width: viewport.width,
              height: viewport.height,
            },
            colors,
            background: appearance.background,
            foreground: appearance.text,
          }
        },
      },
      (snapshot) => {
        const box = bounds.current
        if (!box) return
        const next = independentSpatialMinimapGeometry(snapshot, box.width, box.height)
        if (!next) return
        geometry.current = next
        paintIndependentSpatialMinimap(element, next, window.devicePixelRatio)
        updateViewport(0, 0)
      },
    )
    refresh.current = queue.request
    const detachInput = bindIndependentSpatialMinimapInput({
      canvas: element,
      runtime,
      geometry: () => geometry.current,
      blocked,
      focus: (point) => {
        focus(point)
      },
      navigating: (active) => {
        navigating.current = active
        if (!active) queue.request()
      },
      viewport: updateViewport,
    })
    const observer = new ResizeObserver(() => {
      bounds.current = element.getBoundingClientRect()
      queue.request()
    })
    observer.observe(element)
    if (runtime.canvas) observer.observe(runtime.canvas)
    return () => {
      refresh.current = () => undefined
      detachInput()
      observer.disconnect()
      queue.unsubscribe()
      geometry.current = null
      bounds.current = null
      element.width = 0
      element.height = 0
    }
  }, [runtime, enabled, interacting, blocked, updateViewport, focus])
  return { canvas, focus, viewportMask }
}
