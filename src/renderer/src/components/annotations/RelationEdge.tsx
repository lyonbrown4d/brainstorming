import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useEditor } from '../../state/editor'
import { selectAnnotation } from '../../state/annotationInteraction'
import { InlineAnnotationLabel } from './InlineAnnotationLabel'

export function RelationEdge(props: EdgeProps) {
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
        style={props.style}
        {...(props.markerStart ? { markerStart: props.markerStart } : {})}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        interactionWidth={20}
        onClick={() => {
          selectAnnotation('relation', relation.id)
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-auto absolute"
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
