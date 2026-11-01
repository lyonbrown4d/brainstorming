import { useEffect, useRef } from 'react'
import { useReactFlow, type NodeResizerProps } from '@xyflow/react'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { createTopicWidthGesture, type TopicWidthGesture } from '@renderer/lib/topicWidthGesture'
import { useEditor } from '@renderer/state/editor'

export const useTopicWidthResize = (
  id: string,
): {
  resize: Pick<NodeResizerProps, 'shouldResize' | 'onResizeStart' | 'onResize' | 'onResizeEnd'>
  setSide: (side: 'left' | 'right') => void
} => {
  const flow = useReactFlow<CanvasFlowNode>()
  const gesture = useRef<TopicWidthGesture | null>(null)
  const initialWidth = useRef(0)
  const sequence = useRef(0)
  const side = useRef<'left' | 'right'>('right')
  useEffect(() => () => gesture.current?.cancel(), [id])
  return {
    setSide: (value) => {
      side.current = value
    },
    resize: {
      shouldResize: () => gesture.current?.active() ?? false,
      onResizeStart: () => {
        gesture.current?.cancel()
        const token = ++sequence.current
        const fixedEdge = side.current === 'left' ? 'right' : 'left'
        const node = flow.getNode(id)
        if (!node) return
        const width = node.measured?.width ?? node.width ?? node.initialWidth
        const height = node.measured?.height ?? node.height ?? node.initialHeight
        if (!width || !height) return
        const snapshot = {
          ...node,
          width,
          height,
          position: { ...node.position },
          style: { ...node.style },
          measured: { ...node.measured },
        }
        const source = useEditor.getState()
        const document = source.history.document
        initialWidth.current = node.measured?.width ?? node.width ?? 0
        const restore = () => {
          const apply = () => {
            const current = useEditor.getState()
            if (
              current.workbook.id === source.workbook.id &&
              current.activeSheetId === source.activeSheetId &&
              current.history.document === document &&
              sequence.current === token
            )
              flow.updateNode(id, { ...snapshot, resizing: false })
          }
          apply()
          // React Flow publishes its final dimensions after the public resize callback.
          queueMicrotask(apply)
          // D3/RF can publish its final box after React processes pointer-up. Restore after
          // that paint as well; the token prevents an old cancellation touching a new drag.
          requestAnimationFrame(apply)
        }
        gesture.current = createTopicWidthGesture(
          id,
          (value) => {
            queueMicrotask(() => {
              if (!gesture.current?.active()) return
              flow.updateNode(id, {
                position: {
                  x:
                    fixedEdge === 'right'
                      ? snapshot.position.x + width - value.width
                      : snapshot.position.x,
                  y: snapshot.position.y,
                },
                width: value.width,
                height: value.height,
                measured: { width: value.width, height: value.height },
                style: { ...node.style, width: value.width, height: value.height },
                resizing: true,
              })
            })
          },
          restore,
          fixedEdge,
        )
      },
      onResize: (_event, params) => {
        const scale = useEditor.getState().history.document.topics[id]?.style?.scale ?? 1
        const current = gesture.current
        if (current)
          current.update(current.originalWidth + (params.width - initialWidth.current) / scale)
      },
      onResizeEnd: () => {
        gesture.current?.finish()
      },
    },
  }
}
