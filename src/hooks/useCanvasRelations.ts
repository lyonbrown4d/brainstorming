import { translate } from '@renderer/i18n'
import type { MindMapDocument } from '@core'
import type { RelationAnchor } from '@core/extensions'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, ReactFlowProps } from '@xyflow/react'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'

type RelationHandlers = Pick<
  ReactFlowProps,
  | 'onEdgeClick'
  | 'onEdgeDoubleClick'
  | 'onReconnectStart'
  | 'onReconnect'
  | 'onReconnectEnd'
  | 'onConnectStart'
  | 'onConnect'
  | 'onConnectEnd'
  | 'isValidConnection'
>

/** React Flow owns the drag preview; only a valid completed reconnection changes the document. */
export const useCanvasRelations = (
  projectedEdges: Edge[],
): RelationHandlers & {
  edges: Edge[]
  reconnecting: boolean
} => {
  const playing = usePresentation((state) => state.playing)
  const selected = useAnnotationInteraction((state) => state.selected)
  const sheetId = useEditor((state) => state.activeSheetId)
  const session = useRef<{ sheetId: string; document: MindMapDocument; edgeId?: string } | null>(
    null,
  )
  const [reconnecting, setReconnecting] = useState(false)
  useEffect(() => {
    const cancel = () => {
      session.current = null
      setReconnecting(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', escape, true)
    window.addEventListener('blur', cancel)
    return () => {
      session.current = null
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('blur', cancel)
    }
  }, [sheetId])
  const anchor = (handle: string | null | undefined): RelationAnchor | undefined => {
    const side = handle?.split('-').at(-1)
    return side === 'top' || side === 'right' || side === 'bottom' || side === 'left'
      ? side
      : undefined
  }
  const valid = (source: string | null, target: string | null) => {
    const state = useEditor.getState()
    return (
      !usePresentation.getState().playing &&
      !state.busy &&
      Boolean(
        source &&
        target &&
        source !== target &&
        state.history.document.topics[source] &&
        state.history.document.topics[target],
      )
    )
  }
  const edges = useMemo(
    () =>
      projectedEdges.map((edge) => {
        if (edge.type !== 'relation') return edge
        const active =
          !playing &&
          selected?.kind === 'relation' &&
          selected.sheetId === sheetId &&
          edge.id === `relation-${selected.id}`
        return { ...edge, selected: active, reconnectable: active }
      }),
    [projectedEdges, selected, sheetId, playing],
  )
  return {
    edges,
    reconnecting,
    isValidConnection: ({ source, target }) => valid(source, target),
    onConnectStart: () => {
      if (session.current?.edgeId) return
      const state = useEditor.getState()
      state.commitDraft()
      if (state.busy || useEditor.getState().editingId || usePresentation.getState().playing) return
      session.current = {
        sheetId: state.activeSheetId,
        document: useEditor.getState().history.document,
      }
      setReconnecting(true)
    },
    onConnect: (connection) => {
      const state = useEditor.getState(),
        started = session.current
      if (
        !started ||
        started.edgeId ||
        started.sheetId !== state.activeSheetId ||
        started.document !== state.history.document ||
        !valid(connection.source, connection.target)
      )
        return
      const sourceAnchor = anchor(connection.sourceHandle),
        targetAnchor = anchor(connection.targetHandle)
      const id = crypto.randomUUID()
      if (
        runAnnotationCommand({
          type: 'upsertRelation',
          relation: {
            id,
            from: connection.source,
            to: connection.target,
            title: translate('relationship'),
            arrow: 'end',
            ...(sourceAnchor ? { sourceAnchor } : {}),
            ...(targetAnchor ? { targetAnchor } : {}),
          },
        })
      )
        selectAnnotation('relation', id)
    },
    onConnectEnd: () => {
      session.current = null
      setReconnecting(false)
    },
    onEdgeClick: (event, edge) => {
      if (edge.type !== 'relation') return
      event.stopPropagation()
      selectAnnotation('relation', edge.id.slice('relation-'.length))
    },
    onEdgeDoubleClick: (event, edge) => {
      if (edge.type !== 'relation') return
      event.stopPropagation()
      selectAnnotation('relation', edge.id.slice('relation-'.length), true)
    },
    onReconnectStart: (event, edge) => {
      if (edge.type !== 'relation' || usePresentation.getState().playing) return
      event.stopPropagation()
      const state = useEditor.getState()
      state.commitDraft()
      if (useEditor.getState().editingId || state.busy) return
      session.current = {
        sheetId: state.activeSheetId,
        document: useEditor.getState().history.document,
        edgeId: edge.id,
      }
      setReconnecting(true)
    },
    onReconnect: (edge, connection) => {
      const started = session.current
      const state = useEditor.getState()
      const document = state.history.document
      if (
        started?.sheetId !== state.activeSheetId ||
        started.document !== document ||
        started.edgeId !== edge.id
      )
        return
      const { source, target } = connection
      if (
        !source ||
        !target ||
        source === target ||
        !document.topics[source] ||
        !document.topics[target]
      )
        return
      const relation = document.relations?.find((item) => `relation-${item.id}` === edge.id)
      if (!relation || !valid(source, target)) return
      const sourceAnchor = anchor(connection.sourceHandle),
        targetAnchor = anchor(connection.targetHandle)
      if (
        relation.from === source &&
        relation.to === target &&
        relation.sourceAnchor === sourceAnchor &&
        relation.targetAnchor === targetAnchor
      )
        return
      runAnnotationCommand({
        type: 'upsertRelation',
        relation: {
          ...relation,
          from: source,
          to: target,
          ...(sourceAnchor ? { sourceAnchor } : {}),
          ...(targetAnchor ? { targetAnchor } : {}),
        },
      })
    },
    onReconnectEnd: () => {
      session.current = null
      setReconnecting(false)
    },
  }
}
