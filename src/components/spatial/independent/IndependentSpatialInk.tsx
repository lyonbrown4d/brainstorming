import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { INK_LIMITS, type CanvasPoint, type CanvasStroke } from '@core/ink'
import { canvasStrokePath } from '@shared/ink-path'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { independentSpatialAnchor } from '@renderer/lib/independentSpatialGestureSession'
import { independentSpatialInkPlane } from '@renderer/lib/independentSpatialGestureInk'
import { useEditor } from '@renderer/state/editor'
import { setInkMode, useCanvasInk } from '@renderer/state/canvasInk'
import { usePresentation } from '@renderer/state/presentation'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { translate } from '@renderer/i18n'

export const IndependentSpatialInk = ({
  runtime,
  ready,
}: {
  readonly runtime: IndependentSpatialRuntime
  readonly ready: boolean
}) => {
  const preview = useRef<SVGPathElement>(null)
  useEffect(() => {
    const canvas = runtime.canvas
    if (!ready || !canvas) return
    interface Session {
      pointer: number
      document: typeof runtime.model.document
      workbook: string
      sheet: string
      view: ReturnType<typeof getSpatialView>
      plane: ReturnType<typeof independentSpatialInkPlane>
      stroke: CanvasStroke
      points: CanvasPoint[]
      screen: CanvasPoint[]
      maximum: number
      width: number
    }
    let session: Session | null = null
    let frame: number | null = null
    const cancel = () => {
      const active = session
      session = null
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      preview.current?.setAttribute('d', '')
      if (active && canvas.hasPointerCapture(active.pointer))
        canvas.releasePointerCapture(active.pointer)
    }
    const valid = () => {
      const editor = useEditor.getState(),
        active = session
      return (
        !active ||
        (editor.history.document === active.document &&
          editor.workbook.id === active.workbook &&
          editor.activeSheetId === active.sheet &&
          getSpatialView(active.workbook, active.sheet) === active.view &&
          !editor.busy &&
          !usePresentation.getState().playing)
      )
    }
    const paint = () => {
      frame = null
      if (!session) return
      preview.current?.setAttribute('fill', session.stroke.color)
      preview.current?.setAttribute(
        'd',
        canvasStrokePath({ ...session.stroke, points: session.screen, width: session.width }),
      )
    }
    const down = (event: PointerEvent) => {
      const mode = useCanvasInk.getState().mode
      const editor = useEditor.getState()
      if (
        event.button !== 0 ||
        mode === 'select' ||
        editor.busy ||
        editor.editingId ||
        usePresentation.getState().playing ||
        runtime.model.document !== editor.history.document
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      runtime.freezeCamera()
      if (mode === 'eraser') {
        const hit = runtime.pick(event.clientX, event.clientY)
        if (hit?.kind === 'ink') editor.command({ type: 'removeDrawing', drawingId: hit.drawingId })
        return
      }
      if (!runtime.camera) return
      cancel()
      const drawings = editor.history.document.drawings ?? []
      const remaining =
        INK_LIMITS.totalPoints - drawings.reduce((count, stroke) => count + stroke.points.length, 0)
      if (drawings.length >= INK_LIMITS.strokes || remaining <= 0) {
        editor.setError(translate('inkLimit'))
        return
      }
      const focus = independentSpatialAnchor(runtime, editor.selectedId) ?? { x: 0, y: 0, z: 0 }
      const viewport = canvas.getBoundingClientRect()
      const plane = independentSpatialInkPlane(runtime.camera, viewport, focus)
      const point = plane.point(
        { x: event.clientX, y: event.clientY },
        event.pointerType === 'mouse' ? 0.5 : Math.max(0, Math.min(1, event.pressure)),
      )
      if (!point) return
      const settings = useCanvasInk.getState(),
        points = [point]
      const origin = new Vector3(focus.x, -focus.y, focus.z).applyMatrix4(
        runtime.camera.matrixWorldInverse,
      )
      const scale =
        viewport.height / (2 * Math.tan((runtime.camera.fov * Math.PI) / 360) * -origin.z)
      session = {
        pointer: event.pointerId,
        document: editor.history.document,
        workbook: editor.workbook.id,
        sheet: editor.activeSheetId,
        view: getSpatialView(editor.workbook.id, editor.activeSheetId),
        plane,
        stroke: { id: crypto.randomUUID(), color: settings.color, width: settings.width, points },
        points,
        screen: [{ x: event.clientX, y: event.clientY, pressure: point.pressure }],
        maximum: Math.min(remaining, INK_LIMITS.pointsPerStroke),
        width: settings.width * scale,
      }
      canvas.setPointerCapture(event.pointerId)
      paint()
    }
    const move = (event: PointerEvent) => {
      const active = session
      if (active?.pointer !== event.pointerId) return
      if (!valid()) {
        cancel()
        return
      }
      for (const sample of event.getCoalescedEvents().length
        ? event.getCoalescedEvents()
        : [event]) {
        if (active.points.length >= active.maximum) break
        const point = active.plane.point(
          { x: sample.clientX, y: sample.clientY },
          sample.pointerType === 'mouse' ? 0.5 : Math.max(0, Math.min(1, sample.pressure)),
        )
        const last = active.points.at(-1)
        if (!point || (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5)) continue
        active.points.push(point)
        active.screen.push({ x: sample.clientX, y: sample.clientY, pressure: point.pressure })
      }
      frame ??= requestAnimationFrame(paint)
    }
    const up = (event: PointerEvent) => {
      const active = session
      if (active?.pointer !== event.pointerId) return
      move(event)
      if (session !== active) return
      const stroke = valid()
        ? active.plane.stroke({ ...active.stroke, points: active.points })
        : null
      cancel()
      if (stroke) useEditor.getState().command({ type: 'upsertDrawing', stroke })
    }
    const validate = () => {
      if (!valid()) cancel()
    }
    const stopEditor = useEditor.subscribe(validate)
    const stopView = useSpatialView.subscribe(validate)
    const stopPresentation = usePresentation.subscribe(validate)
    const stopInk = useCanvasInk.subscribe(cancel)
    const stopAnnotation = useAnnotationInteraction.subscribe((state) => {
      if (state.relationMode || state.floating || state.editing) {
        cancel()
        setInkMode('select')
      }
    })
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.isComposing &&
        useCanvasInk.getState().mode !== 'select'
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
        setInkMode('select')
      }
    }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key, true)
    return () => {
      cancel()
      stopEditor()
      stopView()
      stopPresentation()
      stopInk()
      stopAnnotation()
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
    }
  }, [runtime, ready])
  return createPortal(
    <svg
      className="pointer-events-none fixed inset-0 z-20 h-screen w-screen overflow-visible"
      aria-hidden="true"
    >
      <path ref={preview} />
    </svg>,
    document.body,
  )
}
