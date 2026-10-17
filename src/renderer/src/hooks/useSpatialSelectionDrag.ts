import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { layoutDocument } from '@layout'
import type { SpatialPoint } from '@layout/spatial'
import { canvasDropCommand } from '@renderer/lib/canvasDrop'
import { findSpatialDrop, spatialPointerTopic } from '@renderer/lib/spatialDrop'
import {
  createSpatialDrag,
  previewSpatialDrag,
  spatialDocumentDelta,
  spatialDragDelta,
  spatialDragSelection,
  spatialRectangleSelection,
} from '@renderer/lib/spatialDrag'
import {
  bindSpatialDragEvents,
  type SpatialSelectionDragOptions,
  type SpatialSelectionGesture,
} from '@renderer/lib/spatialDragGesture'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { selectedTopicIds, setSelectedTopics } from '@renderer/state/selection'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import {
  beginCanvasDrag,
  clearCanvasDrag,
  updateCanvasDrag,
} from '@renderer/state/canvasInteraction'

/** Three.js owns projection/ray math; the application owns selection and one final command. */
export const useSpatialSelectionDrag = ({
  document,
  layout,
  focusIds,
  controls,
  enabled,
  onSelectionBox,
}: SpatialSelectionDragOptions) => {
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
    let gesture: SpatialSelectionGesture | null = null
    const nodes = layout.nodes.filter((node) => !focusIds || focusIds.has(node.id))
    const valid = () =>
      useEditor.getState().history.document === document &&
      useEditor.getState().activeSheetId === gesture?.sheetId &&
      !usePresentation.getState().playing
    const finish = (commit: boolean) => {
      const current = gesture
      if (!current) return
      const shouldCommit = commit && current.moved && valid()
      gesture = null
      if (current.token) clearCanvasDrag(current.token)
      if (shouldCommit) {
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
        current.token = beginCanvasDrag(document, current.sheetId, current.roots)
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
          if (current.token) updateCanvasDrag(current.token, drop)
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
    const unbind = bindSpatialDragEvents(surface, {
      down,
      move,
      up,
      lostCapture,
      cancel,
      click,
      key,
    })
    const validate = () => {
      if (gesture && !valid()) finish(false)
    }
    const unsubscribe = useEditor.subscribe(validate)
    const unsubscribePresentation = usePresentation.subscribe(validate)
    return () => {
      finish(false)
      unbind()
      unsubscribe()
      unsubscribePresentation()
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
