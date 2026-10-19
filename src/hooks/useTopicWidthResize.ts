import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow, type NodeResizerProps } from '@xyflow/react'
import { applyCommand, type MindMapDocument, type Topic } from '@core'
import { layoutDocument } from '@layout'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

interface ResizeSession {
  document: MindMapDocument
  sheetId: string
  topic: Topic
  position: { x: number; y: number }
  width: number
  height: number
  style: NonNullable<CanvasFlowNode['style']>
}

/** Keep React Flow's preview transient and commit one style command on release. */
export const useTopicWidthResize = (
  id: string,
  topic: Topic,
): Pick<NodeResizerProps, 'shouldResize' | 'onResizeStart' | 'onResizeEnd'> => {
  const flow = useReactFlow<CanvasFlowNode>()
  const session = useRef<ResizeSession | null>(null)
  const cancelled = useRef(false)
  const restore = useCallback(
    (active: ResizeSession): void => {
      const editor = useEditor.getState()
      if (editor.activeSheetId !== active.sheetId || editor.history.document !== active.document)
        return
      flow.updateNode(id, {
        position: active.position,
        width: active.width,
        height: active.height,
        initialWidth: active.width,
        initialHeight: active.height,
        measured: { width: active.width, height: active.height },
        resizing: false,
        style: active.style,
      })
    },
    [flow, id],
  )
  useEffect(() => {
    const cancel = (): void => {
      const active = session.current
      if (!active) return
      session.current = null
      cancelled.current = true
      restore(active)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || !session.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    const unsubscribe = useEditor.subscribe((state) => {
      const active = session.current
      if (
        active &&
        (state.activeSheetId !== active.sheetId ||
          state.history.document !== active.document ||
          state.busy)
      )
        cancel()
    })
    const stopPlaying = usePresentation.subscribe((state) => {
      if (state.playing) cancel()
    })
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      session.current = null
      unsubscribe()
      stopPlaying()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [restore])
  return {
    shouldResize: (_event, bounds) =>
      Boolean(
        session.current &&
        !cancelled.current &&
        Number.isFinite(bounds.width) &&
        Number.isFinite(bounds.x) &&
        bounds.width >= 80 &&
        bounds.width <= 1200,
      ),
    onResizeStart: () => {
      cancelled.current = false
      const editor = useEditor.getState()
      editor.commitDraft()
      const current = useEditor.getState()
      if (current.busy || current.editingId || usePresentation.getState().playing) return
      const node = flow.getNode(id)
      const width = node?.measured?.width ?? node?.width ?? node?.initialWidth
      const height = node?.measured?.height ?? node?.height ?? node?.initialHeight
      if (!node || !width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return
      session.current = {
        topic,
        position: node.position,
        width,
        height,
        style: { ...node.style },
        document: current.history.document,
        sheetId: current.activeSheetId,
      }
    },
    onResizeEnd: (_event, bounds) => {
      const active = session.current
      session.current = null
      if (!active || cancelled.current) return
      const editor = useEditor.getState()
      if (editor.activeSheetId !== active.sheetId || editor.history.document !== active.document)
        return
      const width = Math.round(bounds.width)
      if (!Number.isFinite(width) || width < 80 || width > 1200) {
        restore(active)
        return
      }
      if (width === active.width || width === active.topic.style?.width) {
        restore(active)
        return
      }
      let style = { ...active.topic.style, width }
      if (Math.abs(bounds.x - active.position.x) > 0.01) {
        const candidate = applyCommand(active.document, {
          type: 'setTopicStyle',
          topicId: id,
          style,
        })
        const nextNode = layoutDocument(candidate).nodes.find((node) => node.id === id)
        if (!nextNode) {
          restore(active)
          return
        }
        const oldRight = active.position.x + active.width
        const newRight = nextNode.x + nextNode.width
        const offsetX = (active.topic.style?.offsetX ?? 0) + oldRight - newRight
        if (!Number.isFinite(offsetX) || Math.abs(offsetX) > 1_000_000) {
          restore(active)
          return
        }
        if (Math.abs(oldRight - newRight) > 0.01) style = { ...style, offsetX }
      }
      if (!editor.command({ type: 'setTopicStyle', topicId: id, style })) restore(active)
    },
  }
}
