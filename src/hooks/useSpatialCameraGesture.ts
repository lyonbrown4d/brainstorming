import { useEffect } from 'react'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { usePresentation } from '@renderer/state/presentation'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { isCompositionKey } from '@renderer/state/keyboard'

/** Alt-drag only on empty canvas; ordinary pan, selection and editing keep their existing bindings. */
export const useSpatialCameraGesture = (): void => {
  useEffect(() => {
    let stop: (() => void) | undefined
    const start = (event: PointerEvent): void => {
      const editor = useEditor.getState()
      const workbookId = editor.workbook.id
      const sheetId = editor.activeSheetId
      const original = getSpatialView(workbookId, sheetId)
      if (
        original.mode !== '3d' ||
        !event.altKey ||
        event.button !== 0 ||
        editor.editingId ||
        editor.busy ||
        usePresentation.getState().playing ||
        useCanvasInk.getState().mode !== 'select' ||
        !(event.target instanceof Element) ||
        !event.target.classList.contains('react-flow__pane')
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      stop?.()
      const element = event.target
      element.setPointerCapture(event.pointerId)
      let frame = 0
      let latest = original
      let moved = false
      const suppressClick = (click: MouseEvent): void => {
        if (click.target === element) {
          click.preventDefault()
          click.stopImmediatePropagation()
        }
        window.removeEventListener('click', suppressClick, true)
      }
      const valid = (): boolean => {
        const current = useEditor.getState()
        return (
          current.workbook.id === workbookId &&
          current.activeSheetId === sheetId &&
          current.history.document === editor.history.document &&
          !current.busy &&
          !usePresentation.getState().playing
        )
      }
      const paint = (): void => {
        frame = 0
        useSpatialView.getState().setView(workbookId, sheetId, latest)
      }
      const cleanup = (): void => {
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', move, true)
        window.removeEventListener('pointerup', finish, true)
        window.removeEventListener('pointercancel', cancel, true)
        window.removeEventListener('blur', cancel)
        window.removeEventListener('keydown', key, true)
        unsubscribe()
        unsubscribePresentation()
        if (element.hasPointerCapture(event.pointerId))
          element.releasePointerCapture(event.pointerId)
        if (moved) {
          window.addEventListener('click', suppressClick, { capture: true, once: true })
          setTimeout(() => {
            window.removeEventListener('click', suppressClick, true)
          }, 500)
        }
        stop = undefined
      }
      const cancel = (): void => {
        cleanup()
        useSpatialView.getState().clearView(workbookId, sheetId)
      }
      const move = (pointer: PointerEvent): void => {
        if (pointer.pointerId !== event.pointerId) return
        if (!valid()) {
          cancel()
          return
        }
        const dx = pointer.clientX - event.clientX
        const dy = pointer.clientY - event.clientY
        moved ||= Math.hypot(dx, dy) > 3
        latest = {
          ...original,
          yaw: Math.max(-1.2, Math.min(1.2, original.yaw + dx / 400)),
          pitch: Math.max(-0.9, Math.min(0.9, original.pitch + dy / 400)),
        }
        if (!frame) frame = requestAnimationFrame(paint)
      }
      const finish = (pointer: PointerEvent): void => {
        if (pointer.pointerId !== event.pointerId) return
        const commit = moved && valid()
        cleanup()
        if (commit) saveSpatialView(latest)
        else useSpatialView.getState().clearView(workbookId, sheetId)
      }
      const key = (keyboard: KeyboardEvent): void => {
        if (keyboard.key !== 'Escape' || isCompositionKey(keyboard)) return
        keyboard.preventDefault()
        keyboard.stopImmediatePropagation()
        cancel()
      }
      const unsubscribe = useEditor.subscribe(() => {
        if (!valid()) cancel()
      })
      const unsubscribePresentation = usePresentation.subscribe(() => {
        if (!valid()) cancel()
      })
      stop = cancel
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', finish, true)
      window.addEventListener('pointercancel', cancel, true)
      window.addEventListener('blur', cancel)
      window.addEventListener('keydown', key, true)
    }
    window.addEventListener('pointerdown', start, true)
    return () => {
      stop?.()
      window.removeEventListener('pointerdown', start, true)
    }
  }, [])
}
