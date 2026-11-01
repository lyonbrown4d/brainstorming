import { useLayoutEffect, type RefObject } from 'react'
import { debounce } from 'lodash-es'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { topicNearbyPlacement, topicNearbySize } from '@renderer/lib/topicNearbyPlacement'
import { useTopicWidthPreview } from '@renderer/state/topicWidthPreview'

/** Project all obstacles only after navigation settles, never on every camera frame. */
export const useIndependentSpatialNearbyPlacement = (
  runtime: IndependentSpatialRuntime,
  id: string | undefined,
  element: RefObject<HTMLDivElement | null>,
  ready: boolean,
) => {
  useLayoutEffect(() => {
    const blocked = () =>
      !id ||
      !ready ||
      runtime.interacting ||
      runtime.navigating ||
      Boolean(useTopicWidthPreview.getState().preview)
    const geometry = () => {
      const canvas = runtime.canvas?.getBoundingClientRect()
      const selected = id ? runtime.rectangle(id) : null
      return {
        model: runtime.model,
        blocked: blocked(),
        values: [
          selected?.x,
          selected?.y,
          selected?.width,
          selected?.height,
          canvas?.x,
          canvas?.y,
          canvas?.width,
          canvas?.height,
        ],
      }
    }
    let previous = geometry()
    const hide = () => {
      if (element.current) element.current.hidden = true
    }
    const place = () => {
      const host = element.current
      if (!host || !id || blocked()) {
        hide()
        return
      }
      const canvas = runtime.canvas?.getBoundingClientRect()
      if (!canvas) {
        hide()
        return
      }
      const rectangles = runtime.rectangles()
      const selected = rectangles.find((rectangle) => rectangle.id === id)
      if (!selected) {
        hide()
        return
      }
      const choice = topicNearbyPlacement(
        selected,
        topicNearbySize(runtime.model.document.rootId === id),
        rectangles.filter((rectangle) => rectangle.id !== id),
        { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      )
      host.hidden = !choice
      if (choice)
        Object.assign(host.style, {
          left: `${choice.rectangle.x - selected.x}px`,
          top: `${choice.rectangle.y - selected.y}px`,
        })
    }
    const settled = debounce(place, 120)
    const changed = () => {
      // Hover/drop-hint notifications do not move geometry. Leaving the canvas for
      // an already placed button must keep that button under the pointer.
      const next = geometry()
      if (
        next.model === previous.model &&
        next.blocked === previous.blocked &&
        next.values.every((value, index) => value === previous.values[index])
      )
        return
      previous = next
      hide()
      settled()
    }
    place()
    const stop = runtime.subscribe(changed)
    const stopPreview = useTopicWidthPreview.subscribe(changed)
    return () => {
      stop()
      stopPreview()
      settled.cancel()
    }
  }, [runtime, id, element, ready])
}
