import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useMotionValue } from 'motion/react'
import type { TopicMetadata } from '@core'
import { setMetadataField } from '@renderer/components/metadata/commands'

type MarkerStyle = NonNullable<TopicMetadata['markerStyle']>
type Mode = 'move' | 'left' | 'right'
interface Gesture {
  pointerId: number
  x: number
  y: number
  size: number
  zoom: number
  mode: Mode
  bounds: DOMRect
  original: MarkerStyle
  next: MarkerStyle
  moved: boolean
}
interface Preview {
  style: MarkerStyle
  mode: Mode
  moved: boolean
}

/** Keep document layout fixed during a gesture; Motion previews movement without reflow. */
export const useMarkerGesture = (topicId: string, style: MarkerStyle, count = 1) => {
  const gesture = useRef<Gesture | undefined>(undefined)
  const [preview, setPreview] = useState<Preview>()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const dragging = preview !== undefined
  const cancel = () => {
    gesture.current = undefined
    setPreview(undefined)
    x.set(0)
    y.set(0)
    scale.set(1)
  }
  useEffect(() => {
    if (!dragging) return
    const reset = () => {
      gesture.current = undefined
      setPreview(undefined)
      x.set(0)
      y.set(0)
      scale.set(1)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      reset()
    }
    window.addEventListener('keydown', escape, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('blur', reset)
    }
  }, [dragging, x, y, scale])
  return {
    preview,
    motionStyle: { x, y, scale },
    start: (event: PointerEvent<HTMLElement>, mode: Mode) => {
      if (event.button !== 0) return
      const card = event.currentTarget.closest<HTMLElement>('[data-testid^="topic-"]')
      if (!card) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      const bounds = card.getBoundingClientRect()
      gesture.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        size: style.size ?? 16,
        zoom: bounds.width / card.offsetWidth,
        mode,
        bounds,
        original: style,
        next: style,
        moved: false,
      }
      setPreview({ style, mode, moved: false })
    },
    move: (event: PointerEvent<HTMLElement>) => {
      const active = gesture.current
      if (active?.pointerId !== event.pointerId) return
      event.stopPropagation()
      const dx = event.clientX - active.x
      const dy = event.clientY - active.y
      if (!active.moved && Math.hypot(dx, dy) < 4) return
      active.moved = true
      if (active.mode === 'move') {
        const horizontal =
          (event.clientX - active.bounds.left - active.bounds.width / 2) / active.bounds.width
        const vertical =
          (event.clientY - active.bounds.top - active.bounds.height / 2) / active.bounds.height
        active.next = {
          ...active.original,
          position:
            Math.abs(horizontal) > Math.abs(vertical)
              ? horizontal < 0
                ? 'left'
                : 'right'
              : vertical < 0
                ? 'top'
                : 'bottom',
        }
        x.set(dx / active.zoom)
        y.set(dy / active.zoom)
      } else {
        const delta = (dx / active.zoom) * (active.mode === 'left' ? -1 : 1)
        const size = Math.max(
          12,
          Math.min(48, Math.round(active.size + (2 * delta) / Math.max(1, count))),
        )
        active.next = { ...active.original, size }
        scale.set(size / active.size)
      }
      setPreview({ style: active.next, mode: active.mode, moved: true })
    },
    end: (event: PointerEvent<HTMLElement>) => {
      const active = gesture.current
      if (active?.pointerId !== event.pointerId) return
      event.stopPropagation()
      const changed =
        (active.next.size ?? 16) !== (active.original.size ?? 16) ||
        (active.next.position ?? 'bottom') !== (active.original.position ?? 'bottom')
      if (active.moved && changed) setMetadataField(topicId, 'markerStyle', active.next)
      cancel()
    },
    cancel,
  }
}
