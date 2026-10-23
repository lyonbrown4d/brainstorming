import { useLayoutEffect, useRef } from 'react'
import type { Relation } from '@core'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createIndependentSpatialRelationGeometryReader } from '@renderer/lib/independentSpatialRelationGeometry'
import { useIndependentSpatialRelationDrag } from '@renderer/hooks/useIndependentSpatialRelationDrag'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'
import { Button } from '@renderer/components/ui/button'
import { useAnnotationInteraction, selectAnnotation } from '@renderer/state/annotationInteraction'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'

const RelationOverlay = ({
  runtime,
  relation,
}: {
  runtime: IndependentSpatialRuntime
  relation: Relation
}) => {
  const { translate } = useMessages()
  const selected = useAnnotationInteraction(
    (state) => state.selected?.kind === 'relation' && state.selected.id === relation.id,
  )
  const editing = useAnnotationInteraction(
    (state) => state.editing && state.selected?.id === relation.id,
  )
  const path = useRef<SVGPathElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const begin = useIndependentSpatialRelationDrag(runtime)
  const points =
    relation.routing === 'orthogonal'
      ? (relation.waypoints ?? [{}])
      : relation.routing === 'straight'
        ? []
        : (relation.controlPoints ?? [{}, {}])
  useLayoutEffect(() => {
    const readGeometry = createIndependentSpatialRelationGeometryReader(runtime, relation)
    const update = (kind?: 'camera' | 'model' | 'preview') => {
      const current = runtime.relationPreviews.get(relation.id) ?? relation
      const geometry = readGeometry(kind)
      if (!geometry) return
      path.current?.setAttribute('d', geometry.screenPath())
      const position = geometry.project(geometry.label)
      if (label.current)
        label.current.style.transform = `translate(${position.x}px,${position.y}px) translate(-50%,-50%)`
      const editable = current.routing === 'orthogonal' ? geometry.waypoints : geometry.controls
      controls.current?.querySelectorAll<HTMLElement>('button').forEach((button, index) => {
        const point = editable[index]
        if (!point) return
        const target = geometry.project(point, (index + 1) / (editable.length + 1))
        button.style.transform = `translate(${target.x}px,${target.y}px) translate(-50%,-50%)`
      })
    }
    update()
    return runtime.subscribe(update)
  }, [runtime, relation, selected, editing])
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <path
          ref={path}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          className="pointer-events-auto cursor-move"
          data-testid={`relation-body-${relation.id}`}
          data-annotation-kind="relation"
          data-annotation-id={relation.id}
          onPointerDown={(event) => {
            begin(event, relation, { kind: 'path' })
          }}
          onClick={() => {
            selectAnnotation('relation', relation.id)
          }}
          onDoubleClick={() => {
            selectAnnotation('relation', relation.id, true)
          }}
        />
      </svg>
      <div
        ref={label}
        className="pointer-events-auto absolute top-0 left-0 z-10"
        onPointerDownCapture={(event) => {
          if (selected && !editing) begin(event, relation, { kind: 'label' })
        }}
      >
        <InlineAnnotationLabel
          kind="relation"
          id={relation.id}
          text={relation.title ?? translate('relationship')}
          color={relation.color}
        />
      </div>
      {selected && !editing && (
        <div ref={controls} className="pointer-events-none absolute inset-0 z-10">
          {points.map((_, index) => (
            <Button
              key={index}
              variant="outline"
              size="icon"
              className="pointer-events-auto absolute top-0 left-0 size-4 cursor-move rounded-full border-2 border-primary bg-background transition-none"
              aria-label={`${translate('relationshipControlPoint')} ${index + 1}`}
              data-testid={`relation-control-${relation.id}-${index}`}
              onPointerDown={(event) => {
                begin(event, relation, {
                  kind: relation.routing === 'orthogonal' ? 'waypoint' : 'control',
                  index,
                })
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
export const IndependentSpatialRelations = ({
  runtime,
}: {
  runtime: IndependentSpatialRuntime
}) => {
  const document = useEditor((state) => state.history.document)
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {document.relations?.map((relation) => (
        <RelationOverlay key={relation.id} runtime={runtime} relation={relation} />
      ))}
    </div>
  )
}
