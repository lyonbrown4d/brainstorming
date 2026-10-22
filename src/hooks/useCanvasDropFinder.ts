import { useMemo, useRef } from 'react'
import { useMemoizedFn } from 'ahooks'
import { getNodesBounds, useReactFlow, type OnNodeDrag } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { createCanvasDropFinder } from '@renderer/lib/canvasDropIndex'
import { canvasDragPointer } from '@renderer/lib/canvasDragPointer'

/** The magnetic area is measured in screen pixels, independent of canvas zoom. */
export const useCanvasDropFinder = () => {
  const finder = useRef<ReturnType<typeof createCanvasDropFinder> | null>(null)
  const { screenToFlowPosition, getZoom } = useReactFlow<CanvasFlowNode>()
  const start = useMemoizedFn(
    (document: MindMapDocument, nodes: CanvasFlowNode[], excluded: ReadonlySet<string>) => {
      finder.current = createCanvasDropFinder(document, nodes, excluded, 48 / getZoom())
    },
  )
  const find = useMemoizedFn((event: Parameters<OnNodeDrag>[0], dragged: CanvasFlowNode) => {
    const pointer = canvasDragPointer(event)
    return pointer
      ? finder.current?.(screenToFlowPosition(pointer), getNodesBounds([dragged]))
      : undefined
  })
  const clear = useMemoizedFn(() => {
    finder.current = null
  })
  return useMemo(() => ({ start, find, clear }), [start, find, clear])
}
