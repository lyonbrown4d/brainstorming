import { OUTLINE_WIDTH, INSPECTOR_WIDTH } from '@shared/workbench'
import { useEffect, useRef } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import { useEditor } from '@renderer/state/editor'
import { clearTopicFocus, useTopicFocusRequest } from '@renderer/state/viewport'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

/** Consume explicit navigation only after the target sheet's node projection is ready. */
export const useTopicFocusViewport = (): void => {
  const request = useTopicFocusRequest((state) => state.request)
  const document = useEditor((state) => state.history.document)
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const node = useStore((state) => state.nodeLookup.get(request?.topicId ?? ''))
  const width = useStore((state) => state.width)
  const ready = useStore((state) => state.width > 0 && state.height > 0 && state.panZoom !== null)
  const flow = useReactFlow<TopicFlowNode>()
  const reduced = useReducedMotion()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Strict Mode immediately remounts effects; only a departed canvas cancels its request.
      queueMicrotask(() => {
        const pending = useTopicFocusRequest.getState().request
        if (!mounted.current && pending?.document === document) clearTopicFocus(pending.sequence)
      })
    }
  }, [document])
  useEffect(() => {
    if (!request) return
    if (
      request.workbookId !== workbookId ||
      request.sheetId !== sheetId ||
      request.document !== document
    ) {
      clearTopicFocus(request.sequence)
      return
    }
    if (!ready || node?.data.topic !== document.topics[request.topicId]) return
    const frame = requestAnimationFrame(() => {
      const current = useEditor.getState()
      if (
        useTopicFocusRequest.getState().request !== request ||
        current.workbook.id !== request.workbookId ||
        current.activeSheetId !== request.sheetId ||
        current.history.document !== request.document
      )
        return
      const target = flow.getNode(request.topicId)
      if (!target || target.data.topic !== request.document.topics[request.topicId]) return
      clearTopicFocus(request.sequence)
      const zoom = flow.getZoom()
      const safeLeft = width >= 768 && current.outlineOpen ? OUTLINE_WIDTH : 0
      const safeRight = width >= 768 && current.inspectorOpen ? INSPECTOR_WIDTH : 0
      void flow.setCenter(
        target.position.x +
          Number(target.style?.width ?? 160) / 2 +
          (safeRight - safeLeft) / (2 * zoom),
        target.position.y + Number(target.style?.height ?? 48) / 2,
        { zoom, duration: reduced ? 0 : 180 },
      )
      window.document.getElementById('sheet-panel')?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [request, document, workbookId, sheetId, node, ready, width, flow, reduced])
}
