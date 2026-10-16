import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import { useViewportRequest } from '../state/viewport'
import { useEditor } from '../state/editor'
import type { TopicFlowNode } from '../components/TopicNode'

export function useCanvasViewport(): void {
  const flow = useReactFlow<TopicFlowNode>()
  const reduced = useReducedMotion()
  useEffect(
    () =>
      useViewportRequest.subscribe(({ action }) => {
        const duration = reduced ? 0 : 160
        if (action === 'zoomIn') void flow.zoomIn({ duration })
        else if (action === 'zoomOut') void flow.zoomOut({ duration })
        else if (action === 'actualSize') void flow.zoomTo(1, { duration })
        else if (action === 'centerRoot') {
          const node = flow.getNode(useEditor.getState().history.document.rootId)
          if (node)
            void flow.setCenter(
              node.position.x + Number(node.style?.width ?? 160) / 2,
              node.position.y + Number(node.style?.height ?? 48) / 2,
              { zoom: flow.getZoom(), duration },
            )
        }
      }),
    [flow, reduced],
  )
}
