import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { useReactFlow, useStore } from '@xyflow/react'
import { useEditor } from '../state/editor'
import type { TopicFlowNode } from './TopicNode'
import { documentStructureKey } from '@shared/layout-geometry'

/** Keep keyboard navigation and newly created editors inside the visible canvas. */
export function SelectionVisibility() {
  const reduceMotion = useReducedMotion()
  const selectedId = useEditor((state) => state.selectedId)
  const document = useEditor((state) => state.history.document)
  const flow = useReactFlow<TopicFlowNode>()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const structure = documentStructureKey(document)
  const previous = useRef({ document, selectedId, structure })
  useEffect(() => {
    const prior = previous.current
    previous.current = { document, selectedId, structure }
    // Mounting a sheet restores its viewport; only subsequent navigation should reveal topics.
    if (prior.document === document && prior.selectedId === selectedId) return
    const frame = requestAnimationFrame(() => {
      if (prior.structure !== structure) {
        void flow.fitView({ padding: 0.16, maxZoom: 1.2, duration: reduceMotion ? 0 : 220 })
        return
      }
      const node = flow.getNode(selectedId)
      if (!node || width === 0 || height === 0) return
      const viewport = flow.getViewport()
      const nodeWidth = Number(node.style?.width ?? 160)
      const nodeHeight = Number(node.style?.height ?? 48)
      const left = node.position.x * viewport.zoom + viewport.x
      const top = node.position.y * viewport.zoom + viewport.y
      if (
        left < 22 ||
        top < 22 ||
        left + nodeWidth * viewport.zoom > width - 22 ||
        top + nodeHeight * viewport.zoom > height - 80
      )
        void flow.setCenter(node.position.x + nodeWidth / 2, node.position.y + nodeHeight / 2, {
          zoom: viewport.zoom,
          duration: reduceMotion ? 0 : 180,
        })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [document, selectedId, structure, flow, width, height, reduceMotion])
  return null
}
