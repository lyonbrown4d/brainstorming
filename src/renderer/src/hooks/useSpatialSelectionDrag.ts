import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import type { MindMapDocument } from '@core'
import { layoutDocument } from '../../../layout'
import type { SpatialLayout, SpatialPoint } from '../../../layout/spatial'
import { canvasDropCommand } from '../lib/canvasDrop'
import { findSpatialDrop, spatialPointerTopic } from '../lib/spatialDrop'
import {
  createSpatialDrag,
  previewSpatialDrag,
  spatialDocumentDelta,
  spatialDragDelta,
  spatialDragSelection,
  spatialRectangleSelection,
  type SpatialDragPlane,
  type SpatialScreenRect,
} from '../lib/spatialDrag'
import { useEditor } from '../state/editor'
import { usePresentation } from '../state/presentation'
import { selectedTopicIds, setSelectedTopics } from '../state/selection'
import { useAnnotationInteraction } from '../state/annotationInteraction'

interface Options {
  readonly document: MindMapDocument
  readonly layout: SpatialLayout
  readonly focusIds: ReadonlySet<string> | null
  readonly controls: RefObject<CameraControlsImpl | null>
  readonly enabled: boolean
  readonly onSelectionBox: (box: SpatialScreenRect | null) => void
}
interface Gesture {
  readonly pointerId: number
  readonly target: Element
  readonly sheetId: string
  readonly start: { x: number; y: number }
  readonly anchorId: string | undefined
  readonly plane: SpatialDragPlane | undefined
  readonly roots: string[]
  readonly ids: ReadonlySet<string>
  readonly selected: readonly string[]
  readonly additive: boolean
  moved: boolean
  delta: SpatialPoint
  boxIds: string[]
}

/** Three.js owns projection/ray math; the application owns selection and one final command. */
export function useSpatialSelectionDrag({
  document,
  layout,
  focusIds,
  controls,
  enabled,
  onSelectionBox,
}: Options) {
  const { camera, gl, scene, invalidate } = useThree()
  const [preview, setPreview] = useState<{ ids: ReadonlySet<string>; delta: SpatialPoint } | null>(
    null,
  )
  const [boxIds, setBoxIds] = useState<readonly string[] | null>(null)
  const [active, setActive] = useState(false)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const suppressClick = useRef(false)
  const planar = useMemo(() => layoutDocument(document), [document])
  const directions = useMemo(
    () =>
      new Map(
        planar.edges.flatMap((edge) =>
          edge.direction ? [[edge.target, edge.direction] as const] : [],
        ),
      ),
    [planar],
  )

  useEffect(() => {
    const surface = gl.domElement.closest<HTMLElement>('[data-spatial-surface]')
    if (!surface || !enabled) return
    let gesture: Gesture | null = null
    const nodes = layout.nodes.filter((node) => !focusIds || focusIds.has(node.id))
    const valid = () =>
      useEditor.getState().history.document === document &&
      useEditor.getState().activeSheetId === gesture?.sheetId &&
      !usePresentation.getState().playing
    const finish = (commit: boolean) => {
      const current = gesture
      if (!current) return
      if (commit && current.moved && valid()) {
        if (!current.anchorId)
          setSelectedTopics(
            current.additive ? [...current.selected, ...current.boxIds] : current.boxIds,
          )
        else {
          const viewport = gl.domElement.getBoundingClientRect()
          const drop = findSpatialDrop(
            document,
            nodes,
            current.anchorId,
            current.delta,
            current.ids,
            camera,
            viewport,
            directions,
          )
          const origins = new Map(planar.nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
          const command = canvasDropCommand(
            document,
            current.roots,
            origins,
            spatialDocumentDelta(current.delta),
            drop,
          )
          if (command) useEditor.getState().command(command)
        }
      }
      suppressClick.current = current.moved
      gesture = null
      if (current.target.hasPointerCapture(current.pointerId))
        current.target.releasePointerCapture(current.pointerId)
      if (controls.current) controls.current.enabled = !useEditor.getState().editingId
      setPreview(null)
      setBoxIds(null)
      setDropTargetId(null)
      setActive(false)
      onSelectionBox(null)
      invalidate()
    }
    const down = (event: PointerEvent) => {
      if (!gesture) suppressClick.current = false
      if (gesture || event.button !== 0 || !event.isPrimary || event.altKey) return
      if (!(event.target instanceof Element)) return
      const target = event.target
      const button = target.closest('button')
      if (button && !button.hasAttribute('data-spatial-topic-id')) return
      if (
        target.closest(
          '[contenteditable]:not([contenteditable="false"]), input, textarea, select, [role="textbox"]',
        )
      )
        return
      const id = spatialPointerTopic(target, gl.domElement, scene, camera, {
        x: event.clientX,
        y: event.clientY,
      })
      if (!id && target !== gl.domElement) return
      if (
        id &&
        (!nodes.some((node) => node.id === id) || event.metaKey || event.ctrlKey || event.shiftKey)
      )
        return
      if (!id && !event.shiftKey) return
      if (id === document.rootId || useAnnotationInteraction.getState().fromId) return
      const editor = useEditor.getState()
      editor.commitDraft()
      if (
        useEditor.getState().editingId ||
        editor.busy ||
        useEditor.getState().history.document !== document
      )
        return
      const selected = selectedTopicIds(editor)
      const ids = id ? (selected.includes(id) ? selected : [id]) : selected
      const selection = spatialDragSelection(document, ids)
      const anchor = nodes.find((node) => node.id === id)
      const start = { x: event.clientX, y: event.clientY }
      const plane = anchor
        ? createSpatialDrag(camera, gl.domElement.getBoundingClientRect(), start, anchor.position)
        : undefined
      if (id && (!plane || !selection.roots.length)) return
      gesture = {
        pointerId: event.pointerId,
        target,
        sheetId: editor.activeSheetId,
        start,
        anchorId: id,
        plane,
        ...selection,
        selected: ids,
        additive: event.metaKey || event.ctrlKey,
        moved: false,
        delta: [0, 0, 0],
        boxIds: [],
      }
      suppressClick.current = false
      controls.current?.stop()
      if (controls.current) controls.current.enabled = false
      setActive(true)
      target.setPointerCapture(event.pointerId)
      event.stopPropagation()
    }
    const move = (event: PointerEvent) => {
      const current = gesture
      if (event.pointerId !== current?.pointerId) return
      if (!valid()) {
        finish(false)
        return
      }
      const point = { x: event.clientX, y: event.clientY }
      if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) < 4)
        return
      if (!current.moved && current.anchorId) {
        setSelectedTopics(current.selected)
        useAnnotationInteraction.setState({ selected: null, editing: false })
      }
      current.moved = true
      const viewport = gl.domElement.getBoundingClientRect()
      if (!current.anchorId) {
        current.boxIds = spatialRectangleSelection(nodes, camera, viewport, current.start, point)
        setBoxIds(current.additive ? [...current.selected, ...current.boxIds] : current.boxIds)
        onSelectionBox({
          left: Math.min(current.start.x, point.x) - viewport.left,
          top: Math.min(current.start.y, point.y) - viewport.top,
          width: Math.abs(point.x - current.start.x),
          height: Math.abs(point.y - current.start.y),
        })
      } else if (current.plane) {
        const delta = spatialDragDelta(camera, viewport, point, current.plane)
        if (delta) {
          current.delta = delta
          setPreview({ ids: current.ids, delta })
          const drop = findSpatialDrop(
            document,
            nodes,
            current.anchorId,
            delta,
            current.ids,
            camera,
            viewport,
            directions,
          )
          setDropTargetId(drop?.targetId ?? null)
        }
      }
      event.preventDefault()
      event.stopPropagation()
      invalidate()
    }
    const up = (event: PointerEvent) => {
      if (gesture?.pointerId === event.pointerId) finish(true)
    }
    const cancel = () => {
      finish(false)
    }
    const lostCapture = (event: PointerEvent) => {
      if (gesture?.pointerId === event.pointerId) finish(false)
    }
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture || event.isComposing) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(false)
    }
    surface.addEventListener('pointerdown', down, true)
    surface.addEventListener('click', click, true)
    surface.addEventListener('lostpointercapture', lostCapture, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      finish(false)
      surface.removeEventListener('pointerdown', down, true)
      surface.removeEventListener('click', click, true)
      surface.removeEventListener('lostpointercapture', lostCapture, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
    }
  }, [
    camera,
    controls,
    directions,
    document,
    enabled,
    focusIds,
    gl,
    invalidate,
    layout,
    onSelectionBox,
    planar,
    scene,
  ])
  const previewLayout = useMemo(
    () =>
      preview ? previewSpatialDrag(document, layout, preview.ids, preview.delta, planar) : layout,
    [document, layout, planar, preview],
  )
  return { layout: previewLayout, active, boxIds, dropTargetId }
}
