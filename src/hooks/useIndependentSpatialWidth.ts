import { useEffect, useRef, type PointerEvent } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createTopicWidthGesture, type TopicWidthGesture } from '@renderer/lib/topicWidthGesture'

export const useIndependentSpatialWidth = (runtime: IndependentSpatialRuntime) => {
  const active = useRef<TopicWidthGesture | null>(null)
  useEffect(() => () => active.current?.cancel(), [runtime])
  return (event: PointerEvent<HTMLButtonElement>, id: string, side: 'left' | 'right') => {
    if (event.button !== 0 || runtime.interacting || !runtime.canvas) return
    const node = runtime.model.layout.nodes.find((item) => item.id === id)
    const rectangle = runtime.rectangle(id)
    if (!node || !rectangle || rectangle.width <= 0) return
    event.preventDefault()
    event.stopPropagation()
    runtime.freezeCamera()
    const pointerId = event.pointerId
    const start = event.clientX
    const target = event.currentTarget
    const factor = rectangle.width / node.width
    const scale = runtime.model.document.topics[id]?.style?.scale ?? 1
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      runtime.interacting = false
      runtime.hiddenTopics.delete(id)
      runtime.changed()
    }
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId || !active.current?.active()) return
      active.current.update(
        active.current.originalWidth +
          ((pointer.clientX - start) * (side === 'left' ? -1 : 1)) / factor / scale,
      )
    }
    const finish = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      move(pointer)
      active.current?.finish()
    }
    active.current = createTopicWidthGesture(
      id,
      () => {
        runtime.hiddenTopics.add(id)
        runtime.changed()
      },
      stop,
      side === 'left' ? 'right' : 'left',
    )
    if (!active.current) return
    runtime.interacting = true
    target.setPointerCapture(pointerId)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }
}
