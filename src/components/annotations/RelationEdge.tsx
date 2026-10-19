import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from '@xyflow/react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { selectAnnotation, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'
import { useRelationDrag } from '@renderer/hooks/useRelationDrag'
import { relationGeometry } from '@shared/relation-geometry'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'

export const RelationEdge = (props: EdgeProps) => {
  const { translate } = useMessages()
  const flow = useReactFlow()
  const playing = usePresentation((state) => state.playing)
  const selected = useAnnotationInteraction(
    (state) =>
      state.selected?.kind === 'relation' &&
      `relation-${state.selected.id}` === props.id &&
      state.selected.sheetId === useEditor.getState().activeSheetId,
  )
  const editing = useAnnotationInteraction(
    (state) => state.editing && state.selected?.id === props.id.slice(9),
  )
  const saved = useEditor((state) =>
    state.history.document.relations?.find((item) => `relation-${item.id}` === props.id),
  )
  const start = { x: props.sourceX, y: props.sourceY },
    end = { x: props.targetX, y: props.targetY }
  const geometryFor = (relation: NonNullable<typeof saved>) =>
    relationGeometry(relation, start, end, props.sourcePosition, props.targetPosition)
  const drag = useRelationDrag(saved, saved ? geometryFor(saved) : undefined)
  const relation = drag.relation
  if (!relation) return null
  const geometry = geometryFor(relation)
  const editable = selected && !playing
  const color =
    relation.color ?? (typeof props.style?.stroke === 'string' ? props.style.stroke : undefined)
  const controls =
    relation.routing === 'orthogonal'
      ? geometry.waypoints
      : relation.routing === 'straight'
        ? []
        : geometry.controls
  return (
    <>
      <BaseEdge
        id={props.id}
        path={geometry.path}
        style={{
          ...props.style,
          ...(editable
            ? {
                strokeWidth: (relation.width ?? 2) + 1,
                filter: 'drop-shadow(0 0 2px var(--primary))',
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
          if (playing) return
          if (relation.routing === 'orthogonal' && geometry.waypoints.length < 32) {
            const next = [
              ...geometry.waypoints.map(geometry.relative),
              geometry.relative(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })),
            ]
            runAnnotationCommand({
              type: 'upsertRelation',
              relation: { ...relation, waypoints: next },
            })
          } else selectAnnotation('relation', relation.id, true)
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan nowheel pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${geometry.label.x}px, ${geometry.label.y}px)`,
          }}
          onPointerDownCapture={(event) => {
            if (editable && !editing) drag.begin(event, { kind: 'label' })
          }}
        >
          {playing ? (
            <span
              className="block max-w-60 rounded bg-background/95 px-2 py-1 text-xs whitespace-pre-wrap"
              style={{ color }}
            >
              {relation.title?.trim() ? relation.title : translate('relationship')}
            </span>
          ) : (
            <InlineAnnotationLabel
              kind="relation"
              id={relation.id}
              text={relation.title?.trim() ? relation.title : translate('relationship')}
              color={color}
            />
          )}
        </div>
        {editable &&
          controls.map((point, index) => (
            <Button
              key={index}
              type="button"
              size="icon"
              variant="outline"
              className="nodrag nopan pointer-events-auto absolute size-4 cursor-move rounded-full border-2 border-primary bg-background shadow-sm transition-none"
              style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
              aria-label={`${translate('relationshipControlPoint')} ${index + 1}`}
              data-testid={`relation-control-${relation.id}-${index}`}
              onPointerDown={(event) => {
                drag.begin(event, {
                  kind: relation.routing === 'orthogonal' ? 'waypoint' : 'control',
                  index,
                })
              }}
            />
          ))}
      </EdgeLabelRenderer>
    </>
  )
}
