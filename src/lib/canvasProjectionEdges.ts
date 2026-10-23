import type { Edge } from '@xyflow/react'
import type { AnnotationSelection } from '@renderer/state/annotationInteraction'

/** RF retains structural connection metadata while the shared SVG owns their visible paths. */
export const canvasProjectionEdges = (
  edges: Edge[],
  sheetId: string,
  selected: AnnotationSelection | null,
  playing: boolean,
): Edge[] =>
  edges.map((edge) => {
    if (edge.type !== 'relation') return edge.hidden ? edge : { ...edge, hidden: true }
    const active =
      !playing &&
      selected?.kind === 'relation' &&
      selected.sheetId === sheetId &&
      edge.id === `relation-${selected.id}`
    return { ...edge, selected: active, reconnectable: active }
  })
