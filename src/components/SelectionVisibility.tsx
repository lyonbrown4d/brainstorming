import { getSpatialView } from '@renderer/state/spatialView'
import { OUTLINE_WIDTH, INSPECTOR_WIDTH } from '@shared/workbench'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useStore } from '@xyflow/react'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { documentStructureKey } from '@shared/layout-geometry'
import { useTopicFocusRequest } from '@renderer/state/viewport'
import { useTopicFocusViewport } from '@renderer/hooks/useTopicFocusViewport'
import { requestSpatialCamera } from '@renderer/state/spatialCameraCommands'

/** Keep keyboard navigation and newly created editors inside the visible canvas. */
export const SelectionVisibility = () => {
  useTopicFocusViewport()
  const topicFocus = useTopicFocusRequest((state) => state.request)
  const reduceMotion = useReducedMotion()
  const playing = usePresentation((state) => state.playing)
  const restoreRequest = usePresentation((state) => state.viewportRequest)
  const selectedId = useEditor((state) => state.selectedId)
  const document = useEditor((state) => state.history.document)
  const projectionReady = useStore(
    (state) => state.nodeLookup.get(selectedId)?.data.topic === document.topics[selectedId],
  )
  const flow = useReactFlow<TopicFlowNode>()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const structure = documentStructureKey(document)
  const previous = useRef({ document, selectedId, structure, restoreRequest })
  useEffect(() => {
    const editor = useEditor.getState()
    const spatial = getSpatialView(editor.workbook.id, editor.activeSheetId).mode === '3d'
    // Rust layout arrives after the document command. Keep the previous selection
    // until that node is projected, so framing cannot consume an obsolete graph.
    if (!spatial && document.topics[selectedId] && !projectionReady) return
    const prior = previous.current
    previous.current = { document, selectedId, structure, restoreRequest }
    // Playback owns framing; its exit snapshot must also preserve an offscreen selection.
    if (playing || topicFocus || prior.restoreRequest !== restoreRequest) return
    // Mounting a sheet restores its viewport; only subsequent navigation should reveal topics.
    if (prior.document === document && prior.selectedId === selectedId) return
    const frame = requestAnimationFrame(() => {
      const editor = useEditor.getState()
      const spatial = getSpatialView(editor.workbook.id, editor.activeSheetId).mode === '3d'
      const immediate = Boolean(reduceMotion) || editor.editingId !== null
      if (prior.structure !== structure && !spatial) {
        void flow.fitView({
          padding: canvasFitPadding(),
          maxZoom: 1.2,
          duration: immediate ? 0 : 220,
        })
        return
      }
      // Pointer placement and history must not reframe an unchanged selection.
      if (prior.selectedId === selectedId && prior.document.topics[selectedId]) return
      const node = flow.getNode(selectedId)
      if (width === 0 || height === 0) return
      if (!node) {
        if (spatial && document.topics[selectedId])
          requestSpatialCamera({ kind: 'focusTopic', topicId: selectedId })
        return
      }
      const viewport = flow.getViewport()
      const { outlineOpen, inspectorOpen } = useEditor.getState()
      const safeLeft = width >= 768 && outlineOpen ? OUTLINE_WIDTH : 0
      const safeRight = width >= 768 && inspectorOpen ? INSPECTOR_WIDTH : 0
      const nodeWidth = Number(node.style?.width ?? 160)
      const nodeHeight = Number(node.style?.height ?? 48)
      const left = node.position.x * viewport.zoom + viewport.x
      const top = node.position.y * viewport.zoom + viewport.y
      if (
        left < safeLeft + 22 ||
        top < 22 ||
        left + nodeWidth * viewport.zoom > width - safeRight - 22 ||
        top + nodeHeight * viewport.zoom > height - 80
      ) {
        if (spatial) {
          requestSpatialCamera({ kind: 'focusTopic', topicId: selectedId })
          return
        }
        void flow.setCenter(
          node.position.x + nodeWidth / 2 + (safeRight - safeLeft) / (2 * viewport.zoom),
          node.position.y + nodeHeight / 2,
          {
            zoom: viewport.zoom,
            duration: immediate ? 0 : 180,
          },
        )
      }
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [
    document,
    selectedId,
    structure,
    flow,
    width,
    height,
    reduceMotion,
    playing,
    restoreRequest,
    topicFocus,
    projectionReady,
  ])
  return null
}
