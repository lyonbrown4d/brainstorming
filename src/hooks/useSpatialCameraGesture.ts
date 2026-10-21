import { useEffect, useRef, useState } from 'react'
import { MOUSE, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSpatialCamera } from '@renderer/lib/spatialCamera'
import { isCompositionKey } from '@renderer/state/keyboard'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { saveSpatialView } from '@renderer/state/spatialActions'
import {
  DEFAULT_SPATIAL_VIEW,
  getSpatialView,
  useSpatialView,
  type SpatialView,
} from '@renderer/state/spatialView'

interface CameraSession {
  readonly workbookId: string
  readonly sheetId: string
  readonly document: object
  readonly original: SpatialView
  readonly pointerId: number
  latest: SpatialView
  frame: number
}

/** Three OrbitControls owns rotation; this hook owns the editor preview/commit boundary. */
export const useSpatialCameraGesture = (
  element: HTMLDivElement | null,
  active: boolean,
): boolean => {
  const [dragging, setDragging] = useState(false)
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    if (!element) return
    const camera = createSpatialCamera({ ...DEFAULT_SPATIAL_VIEW, mode: '3d' }, 1000)
    const controls = new OrbitControls(camera, element)
    controls.enabled = false
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE }
    let session: CameraSession | null = null
    const clear = (commit: boolean): void => {
      const current = session
      if (!current) return
      session = null
      cancelAnimationFrame(current.frame)
      controls.enabled = false
      setDragging(false)
      if (commit && valid(current) && current.latest !== current.original) {
        saveSpatialView({ yaw: current.latest.yaw, pitch: current.latest.pitch })
      } else {
        useSpatialView.getState().clearView(current.workbookId, current.sheetId)
      }
    }
    const valid = (current: CameraSession): boolean => {
      const editor = useEditor.getState()
      return (
        editor.workbook.id === current.workbookId &&
        editor.activeSheetId === current.sheetId &&
        editor.history.document === current.document &&
        !editor.busy &&
        !editor.editingId &&
        !usePresentation.getState().playing &&
        useCanvasInk.getState().mode === 'select' &&
        getSpatialView(current.workbookId, current.sheetId).mode === '3d'
      )
    }
    const preview = (): void => {
      const current = session
      if (!current || !valid(current)) {
        clear(false)
        return
      }
      current.frame = 0
      useSpatialView.getState().setView(current.workbookId, current.sheetId, current.latest)
    }
    const changed = (): void => {
      const current = session
      if (!current || !valid(current)) {
        clear(false)
        return
      }
      const offset = camera.position.clone().sub(controls.target).normalize()
      const yaw = Math.atan2(offset.x, offset.z)
      const pitch = Math.asin(Math.max(-1, Math.min(1, offset.y)))
      if (
        Math.abs(yaw - current.original.yaw) < 1e-5 &&
        Math.abs(pitch - current.original.pitch) < 1e-5
      )
        return
      current.latest = { ...current.original, yaw, pitch }
      if (!current.frame) current.frame = requestAnimationFrame(preview)
    }
    const start = (event: PointerEvent): void => {
      const editor = useEditor.getState()
      const workbookId = editor.workbook.id
      const sheetId = editor.activeSheetId
      const original = getSpatialView(workbookId, sheetId)
      const allowed =
        activeRef.current &&
        original.mode === '3d' &&
        event.button === 0 &&
        !editor.busy &&
        !editor.editingId &&
        !usePresentation.getState().playing &&
        useCanvasInk.getState().mode === 'select'
      controls.enabled = allowed
      if (!allowed) return
      event.preventDefault()
      clear(false)
      controls.enabled = true
      session = {
        workbookId,
        sheetId,
        document: editor.history.document,
        original,
        pointerId: event.pointerId,
        latest: original,
        frame: 0,
      }
      const target = original.target ?? { x: 0, y: 0, z: 0 }
      controls.target.set(target.x, -target.y, target.z)
      camera.position
        .copy(controls.target)
        .add(
          new Vector3(0, 0, 1000).applyQuaternion(createSpatialCamera(original, 1000).quaternion),
        )
      camera.quaternion.copy(createSpatialCamera(original, 1000).quaternion)
      controls.update()
      setDragging(true)
    }
    const ended = (): void => {
      clear(true)
    }
    const canceled = (event: PointerEvent): void => {
      if (session?.pointerId === event.pointerId) clear(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isCompositionKey(event) || !session) return
      event.preventDefault()
      event.stopImmediatePropagation()
      clear(false)
    }
    const validate = (): void => {
      if (session && !valid(session)) clear(false)
    }
    const stopBubble = (event: Event): void => {
      event.stopPropagation()
    }
    element.addEventListener('pointerdown', start, true)
    element.addEventListener('pointerdown', stopBubble)
    element.addEventListener('click', stopBubble)
    element.addEventListener('dblclick', stopBubble)
    controls.addEventListener('change', changed)
    controls.addEventListener('end', ended)
    element.addEventListener('pointercancel', canceled, true)
    const blur = (): void => {
      clear(false)
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', key, true)
    const unsubscribeEditor = useEditor.subscribe(validate)
    const unsubscribePresentation = usePresentation.subscribe(validate)
    const unsubscribeInk = useCanvasInk.subscribe(validate)
    return () => {
      clear(false)
      element.removeEventListener('pointerdown', start, true)
      element.removeEventListener('pointerdown', stopBubble)
      element.removeEventListener('click', stopBubble)
      element.removeEventListener('dblclick', stopBubble)
      controls.removeEventListener('change', changed)
      controls.removeEventListener('end', ended)
      element.removeEventListener('pointercancel', canceled, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', key, true)
      unsubscribeEditor()
      unsubscribePresentation()
      unsubscribeInk()
      controls.dispose()
    }
  }, [element])
  return dragging
}
