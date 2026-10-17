import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useStore } from '@xyflow/react'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import type { TopicFlowNode } from '@renderer/components/TopicNode'
import { documentStructureKey } from '@shared/layout-geometry'

/** Keep keyboard navigation and newly created editors inside the visible canvas. */
export const SelectionVisibility = () => {
  const reduceMotion = useReducedMotion()
  const playing = usePresentation((state) => state.playing)
  const restoreRequest = usePresentation((state) => state.viewportRequest)
  const selectedId = useEditor((state) => state.selectedId)
  const document = useEditor((state) => state.history.document)
  const flow = useReactFlow<TopicFlowNode>()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const structure = documentStructureKey(document)
  const previous = useRef({ document, selectedId, structure, restoreRequest })
  useEffect(() => {
    const prior = previous.current
    previous.current = { document, selectedId, structure, restoreRequest }
    // Playback owns framing; its exit snapshot must also preserve an offscreen selection.
    if (playing || prior.restoreRequest !== restoreRequest) return
    // Mounting a sheet restores its viewport; only subsequent navigation should reveal topics.
    if (prior.document === document && prior.selectedId === selectedId) return
    const frame = requestAnimationFrame(() => {
      if (prior.structure !== structure) {
        void flow.fitView({
          padding: canvasFitPadding(),
          maxZoom: 1.2,
          duration: reduceMotion ? 0 : 220,
        })
        return
      }
      const node = flow.getNode(selectedId)
      if (!node || width === 0 || height === 0) return
      const viewport = flow.getViewport()
      const { outlineOpen, inspectorOpen } = useEditor.getState()
      const safeLeft = outlineOpen ? 216 : 0
      const safeRight = inspectorOpen ? 256 : 0
      const nodeWidth = Number(node.style?.width ?? 160)
      const nodeHeight = Number(node.style?.height ?? 48)
      const left = node.position.x * viewport.zoom + viewport.x
      const top = node.position.y * viewport.zoom + viewport.y
      if (
        left < safeLeft + 22 ||
        top < 22 ||
        left + nodeWidth * viewport.zoom > width - safeRight - 22 ||
        top + nodeHeight * viewport.zoom > height - 80
      )
        void flow.setCenter(
          node.position.x + nodeWidth / 2 + (safeRight - safeLeft) / (2 * viewport.zoom),
          node.position.y + nodeHeight / 2,
          {
            zoom: viewport.zoom,
            duration: reduceMotion ? 0 : 180,
          },
        )
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [document, selectedId, structure, flow, width, height, reduceMotion, playing, restoreRequest])
  return null
}
