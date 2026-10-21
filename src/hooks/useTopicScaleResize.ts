import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow, type NodeResizerProps } from '@xyflow/react'
import { applyCommand, type Topic } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { ScaleSession } from '@renderer/lib/canvasGestureSession'
import { computeNativeLayout } from '@renderer/lib/nativeLayout'
import { fetchNativeSpatialLayout } from '@renderer/lib/nativeSpatialLayout'
import { spatialCameraDelta } from '@renderer/lib/spatialCamera'
import { projectSpatialLayout } from '@renderer/lib/spatialProjection'
import { useEditor } from '@renderer/state/editor'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'
import { usePresentation } from '@renderer/state/presentation'
import { useTopicScalePreview } from '@renderer/state/topicScalePreview'
import { hasNativeEditor } from '@renderer/state/nativeEditorQueue'

/** React Flow supplies the proportional box; the document receives one style command. */
export const useTopicScaleResize = (
  id: string,
  topic: Topic,
): {
  resize: Pick<NodeResizerProps, 'shouldResize' | 'onResizeStart' | 'onResize' | 'onResizeEnd'>
  setCorner: (corner: ScaleSession['corner']) => void
} => {
  const flow = useReactFlow<CanvasFlowNode>()
  const session = useRef<ScaleSession | null>(null)
  const pending = useRef<ScaleSession | null>(null)
  const submitted = useRef(false)
  const corner = useRef<ScaleSession['corner']>('bottom-right')
  const cancelled = useRef(false)
  const restore = useCallback(
    (active: ScaleSession): void => {
      useTopicScalePreview.getState().clear(id)
      const current = useEditor.getState()
      if (
        current.workbook.id !== active.workbookId ||
        current.activeSheetId !== active.sheetId ||
        current.history.document !== active.document
      )
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
    const cancelPending = (): void => {
      const active = pending.current
      if (!active || submitted.current) return
      pending.current = null
      restore(active)
    }
    const cancel = (): void => {
      const active = session.current
      if (active) {
        session.current = null
        cancelled.current = true
        restore(active)
      }
      cancelPending()
    }
    const key = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Escape' ||
        event.isComposing ||
        (!session.current && (!pending.current || submitted.current))
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    const unsubscribe = useEditor.subscribe((state) => {
      const active = session.current
      if (
        active &&
        (state.workbook.id !== active.workbookId ||
          state.activeSheetId !== active.sheetId ||
          state.history.document !== active.document ||
          state.busy)
      )
        cancel()
      const waiting = pending.current
      if (
        waiting &&
        (state.workbook.id !== waiting.workbookId || state.activeSheetId !== waiting.sheetId)
      ) {
        pending.current = null
        useTopicScalePreview.getState().clear(id)
      } else if (
        waiting &&
        !submitted.current &&
        (state.history.document !== waiting.document || state.busy)
      ) {
        cancelPending()
      }
    })
    const stopPlaying = usePresentation.subscribe((state) => {
      if (state.playing) cancel()
    })
    const stopView = useSpatialView.subscribe(() => {
      const active = session.current ?? pending.current
      if (active && getSpatialView(active.workbookId, active.sheetId) !== active.view) cancel()
    })
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      cancel()
      pending.current = null
      useTopicScalePreview.getState().clear(id)
      unsubscribe()
      stopPlaying()
      stopView()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [id, restore])
  return {
    setCorner: (value) => {
      corner.current = value
    },
    resize: {
      shouldResize: (_event, bounds) => {
        const active = session.current
        if (!active || cancelled.current || pending.current) return false
        const scale = bounds.width / active.baseWidth
        return (
          Number.isFinite(scale) &&
          scale >= 0.5 &&
          scale <= 3 &&
          Number.isFinite(bounds.height) &&
          Number.isFinite(bounds.x) &&
          Number.isFinite(bounds.y)
        )
      },
      onResizeStart: () => {
        if (pending.current) return
        cancelled.current = false
        submitted.current = false
        useEditor.getState().commitDraft()
        const current = useEditor.getState()
        if (current.busy || current.editingId || usePresentation.getState().playing) return
        const node = flow.getNode(id)
        const width = node?.measured?.width ?? node?.width ?? node?.initialWidth
        const height = node?.measured?.height ?? node?.height ?? node?.initialHeight
        if (!node || !width || !height || !Number.isFinite(width) || !Number.isFinite(height))
          return
        const initialScale = topic.style?.scale ?? 1
        session.current = {
          document: current.history.document,
          workbookId: current.workbook.id,
          sheetId: current.activeSheetId,
          topic,
          view: getSpatialView(current.workbook.id, current.activeSheetId),
          corner: corner.current,
          position: node.position,
          width,
          height,
          style: { ...node.style },
          baseWidth: width / initialScale,
          baseHeight: height / initialScale,
        }
      },
      onResize: (_event, bounds) => {
        const active = session.current
        if (active && !cancelled.current)
          useTopicScalePreview.getState().show(id, bounds.width / active.baseWidth)
      },
      onResizeEnd: (_event, bounds) => {
        const active = session.current
        session.current = null
        if (!active || cancelled.current) return
        const editor = useEditor.getState()
        if (
          editor.workbook.id !== active.workbookId ||
          editor.activeSheetId !== active.sheetId ||
          editor.history.document !== active.document ||
          getSpatialView(active.workbookId, active.sheetId) !== active.view ||
          usePresentation.getState().playing
        ) {
          restore(active)
          return
        }
        const scale = Math.round((bounds.width / active.baseWidth) * 100) / 100
        if (
          !Number.isFinite(scale) ||
          scale < 0.5 ||
          scale > 3 ||
          Math.abs(bounds.height / active.baseHeight - scale) > 0.02 ||
          scale === (active.topic.style?.scale ?? 1)
        ) {
          restore(active)
          return
        }
        pending.current = active
        const candidate = applyCommand(active.document, {
          type: 'setTopicStyle',
          topicId: id,
          style: { ...active.topic.style, scale },
        })
        const nextLayout =
          active.view.mode === '3d'
            ? fetchNativeSpatialLayout(candidate, active.sheetId, active.view)
            : computeNativeLayout(candidate).then((layout) => ({ layout, depths: undefined }))
        void nextLayout
          .then(({ layout, depths }) => {
            const current = useEditor.getState()
            if (pending.current !== active) return
            if (
              current.workbook.id !== active.workbookId ||
              current.activeSheetId !== active.sheetId ||
              current.history.document !== active.document ||
              getSpatialView(active.workbookId, active.sheetId) !== active.view ||
              current.busy ||
              usePresentation.getState().playing
            ) {
              pending.current = null
              restore(active)
              return
            }
            const next = projectSpatialLayout(candidate, layout, active.view, depths).nodes.find(
              (node) => node.id === id,
            )
            if (!next) {
              pending.current = null
              restore(active)
              return
            }
            const anchorX = active.corner.includes('left') ? bounds.x + bounds.width : bounds.x
            const anchorY = active.corner.startsWith('top') ? bounds.y + bounds.height : bounds.y
            const x = active.corner.includes('left') ? anchorX - next.width : anchorX
            const y = active.corner.startsWith('top') ? anchorY - next.height : anchorY
            const delta = spatialCameraDelta(active.view, { x: x - next.x, y: y - next.y })
            const offsetX = (active.topic.style?.offsetX ?? 0) + delta.x
            const offsetY = (active.topic.style?.offsetY ?? 0) + delta.y
            if (
              !Number.isFinite(offsetX) ||
              !Number.isFinite(offsetY) ||
              Math.abs(offsetX) > 1_000_000 ||
              Math.abs(offsetY) > 1_000_000
            ) {
              pending.current = null
              restore(active)
              return
            }
            submitted.current = true
            const accepted = current.command(
              {
                type: 'setTopicStyle',
                topicId: id,
                style: {
                  ...active.topic.style,
                  scale,
                  offsetX,
                  offsetY,
                  ...(delta.z
                    ? { spatialDepth: (active.topic.style?.spatialDepth ?? 0) + delta.z }
                    : {}),
                },
              },
              () => {
                if (pending.current !== active) return
                pending.current = null
                restore(active)
              },
              () => {
                if (pending.current !== active) return
                pending.current = null
                useTopicScalePreview.getState().clear(id)
              },
            )
            if (!accepted) {
              pending.current = null
              restore(active)
            } else if (!hasNativeEditor()) {
              pending.current = null
              useTopicScalePreview.getState().clear(id)
            }
          })
          .catch(() => {
            if (pending.current !== active) return
            pending.current = null
            restore(active)
          })
      },
    },
  }
}
