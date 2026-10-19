import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { INK_LIMITS, type CanvasPoint, type CanvasStroke } from '@core/ink'
import type { HistoryState } from '@core'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { setInkMode, useCanvasInk } from '@renderer/state/canvasInk'
import { canvasStrokePath } from '@shared/ink-path'
import { translate } from '@renderer/i18n'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'

interface InkGesture {
  pointerId: number
  target: HTMLDivElement
  stroke: CanvasStroke
  points: CanvasPoint[]
  maximum: number
  history: HistoryState
}

/** Pointer samples and RAF preview stay local; only pointer-up commits one document command. */
export const useInkDrawing = () => {
  const flow = useReactFlow()
  const mode = useCanvasInk((state) => state.mode)
  const sheetId = useEditor((state) => state.activeSheetId)
  const preview = useRef<SVGPathElement>(null)
  const gesture = useRef<InkGesture | null>(null)
  const frame = useRef<number | null>(null)
  const cancel = (): void => {
    const active = gesture.current
    gesture.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    preview.current?.setAttribute('d', '')
    if (active?.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId)
  }
  useEffect(() => {
    const workbookId = useEditor.getState().workbook.id
    const unsubscribe = useEditor.subscribe((state) => {
      if (
        state.activeSheetId !== sheetId ||
        state.workbook.id !== workbookId ||
        state.busy ||
        (gesture.current && state.history !== gesture.current.history)
      )
        cancel()
    })
    const unsubscribeAnnotation = useAnnotationInteraction.subscribe((state) => {
      if (state.relationMode || state.floating || state.editing) {
        cancel()
        setInkMode('select')
      }
    })
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || useCanvasInk.getState().mode === 'select')
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
      setInkMode('select')
    }
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keyboard, true)
    return () => {
      cancel()
      unsubscribe()
      unsubscribeAnnotation()
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keyboard, true)
    }
  }, [mode, sheetId])
  const point = (event: ReactPointerEvent<HTMLDivElement>): CanvasPoint => {
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    return {
      x: Math.max(-INK_LIMITS.coordinate, Math.min(INK_LIMITS.coordinate, position.x)),
      y: Math.max(-INK_LIMITS.coordinate, Math.min(INK_LIMITS.coordinate, position.y)),
      pressure: event.pointerType === 'mouse' ? 0.5 : Math.max(0, Math.min(1, event.pressure)),
    }
  }
  const paint = (): void => {
    frame.current = null
    const active = gesture.current
    if (!active) return
    preview.current?.setAttribute(
      'd',
      canvasStrokePath({ ...active.stroke, points: active.points }),
    )
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || useEditor.getState().busy || usePresentation.getState().playing)
      return
    event.preventDefault()
    event.stopPropagation()
    if (mode !== 'pen') return
    cancel()
    const drawings = useEditor.getState().history.document.drawings ?? []
    const remaining =
      INK_LIMITS.totalPoints - drawings.reduce((count, stroke) => count + stroke.points.length, 0)
    if (drawings.length >= INK_LIMITS.strokes || remaining <= 0) {
      useEditor.getState().setError(translate('inkLimit'))
      return
    }
    const settings = useCanvasInk.getState()
    const points = [point(event)]
    gesture.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      stroke: { id: crypto.randomUUID(), color: settings.color, width: settings.width, points },
      points,
      maximum: Math.min(remaining, INK_LIMITS.pointsPerStroke),
      history: useEditor.getState().history,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    preview.current?.setAttribute('fill', settings.color)
    paint()
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = gesture.current
    if (active?.pointerId !== event.pointerId || active.points.length >= active.maximum) return
    const next = point(event)
    const last = active.points.at(-1)
    if (last && Math.hypot(next.x - last.x, next.y - last.y) < 0.5) return
    active.points.push(next)
    frame.current ??= requestAnimationFrame(paint)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = gesture.current
    if (active?.pointerId !== event.pointerId) return
    onPointerMove(event)
    const stroke = { ...active.stroke, points: active.points }
    cancel()
    useEditor.getState().command({ type: 'upsertDrawing', stroke })
  }
  return {
    preview,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  }
}
