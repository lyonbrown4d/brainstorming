import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useEditor } from '../../state/editor'
import { selectAnnotation, useAnnotationInteraction } from '../../state/annotationInteraction'
import { InlineAnnotationLabel } from './InlineAnnotationLabel'

export function RelationEdge(props: EdgeProps) {
  const selected = useAnnotationInteraction(
    (state) =>
      state.selected?.kind === 'relation' &&
      `relation-${state.selected.id}` === props.id &&
      state.selected.sheetId === useEditor.getState().activeSheetId,
  )
  const relation = useEditor((state) =>
    state.history.document.relations?.find((item) => `relation-${item.id}` === props.id),
  )
  const [path, x, y] = getBezierPath(props)
  if (!relation) return null
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          ...props.style,
          ...(selected
            ? {
                strokeWidth: (relation.width ?? 2) + 2,
                filter: 'drop-shadow(0 0 3px var(--primary))',
              }
            : {}),
        }}
        {...(props.markerStart ? { markerStart: props.markerStart } : {})}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        interactionWidth={20}
        onClick={(event) => {
          event.stopPropagation()
          selectAnnotation('relation', relation.id)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          selectAnnotation('relation', relation.id, true)
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan nowheel pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        >
          <InlineAnnotationLabel
            kind="relation"
            id={relation.id}
            text={relation.title?.trim() ? relation.title : '关联线'}
            color={relation.color}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
