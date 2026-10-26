import { useEffect } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import { getNodeDimensions } from '@xyflow/system'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { useEditor } from '@renderer/state/editor'
import { INSPECTOR_WIDTH, OUTLINE_WIDTH } from '@shared/workbench'

/** Reframe before virtualization can unmount the focused editor on a resize. */
export const useCanvasEditorViewport = (): void => {
  const store = useStoreApi<CanvasFlowNode>()
  const flow = useReactFlow<CanvasFlowNode>()
  useEffect(
    () =>
      store.subscribe((next, previous) => {
        if (
          (next.width === previous.width && next.height === previous.height) ||
          previous.width <= 0 ||
          previous.height <= 0 ||
          next.width <= 0 ||
          next.height <= 0
        )
          return
        const editor = useEditor.getState()
        if (!editor.editingId || editor.editingSurface !== 'canvas') return
        const node = next.nodeLookup.get(editor.editingId)
        if (node?.type !== 'topic') return
        const { width, height } = getNodeDimensions(node)
        const [x, y, zoom] = next.transform
        const position = node.internals.positionAbsolute
        const left = next.width >= 768 && editor.outlineOpen ? OUTLINE_WIDTH : 0
        const right = next.width >= 768 && editor.inspectorOpen ? INSPECTOR_WIDTH : 0
        const px = position.x * zoom + x
        const py = position.y * zoom + y
        if (
          px >= left + 22 &&
          py >= 22 &&
          px + width * zoom <= next.width - right - 22 &&
          py + height * zoom <= next.height - 80
        )
          return
        // Store subscriptions run before React commits the new visible-node set.
        // Keep this synchronous and preserve zoom; a later effect is too late.
        void flow.setCenter(
          position.x + width / 2 + (right - left) / (2 * zoom),
          position.y + height / 2,
          { zoom, duration: 0 },
        )
      }),
    [flow, store],
  )
}
