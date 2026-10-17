import { useMemo, useRef, useState } from 'react'
import type { Edge, ReactFlowProps } from '@xyflow/react'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'

type RelationHandlers = Pick<
  ReactFlowProps,
  'onEdgeClick' | 'onEdgeDoubleClick' | 'onReconnectStart' | 'onReconnect' | 'onReconnectEnd'
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
  const session = useRef<{ sheetId: string; documentId: string; edgeId: string } | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
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
        documentId: state.history.document.id,
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
        started.documentId !== document.id ||
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
      if (!relation || (relation.from === source && relation.to === target)) return
      runAnnotationCommand({
        type: 'upsertRelation',
        relation: { ...relation, from: source, to: target },
      })
    },
    onReconnectEnd: () => {
      session.current = null
      setReconnecting(false)
    },
  }
}
