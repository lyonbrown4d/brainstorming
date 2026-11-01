import { useLayoutEffect, useRef } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useTopicDirectControls } from '@renderer/hooks/useTopicDirectControls'
import { useIndependentSpatialWidth } from '@renderer/hooks/useIndependentSpatialWidth'
import { useTopicWidthPreview } from '@renderer/state/topicWidthPreview'
import { useMessages } from '@renderer/i18n/useMessages'
import { TopicNearbyAdd } from '@renderer/components/TopicNearbyAdd'
import { Button } from '@renderer/components/ui/button'
import { SpatialTopicWidthPreview } from '@renderer/components/spatial/independent/SpatialTopicWidthPreview'
import { useIndependentSpatialNearbyPlacement } from '@renderer/hooks/useIndependentSpatialNearbyPlacement'

export const IndependentSpatialTopicControls = ({
  runtime,
  ready,
}: {
  runtime: IndependentSpatialRuntime
  ready: boolean
}) => {
  const { translate } = useMessages()
  const id = useTopicDirectControls()
  const preview = useTopicWidthPreview((state) => state.preview)
  const target = useRef<HTMLDivElement>(null)
  const add = useRef<HTMLDivElement>(null)
  const begin = useIndependentSpatialWidth(runtime)
  useIndependentSpatialNearbyPlacement(runtime, id, add, ready)
  useLayoutEffect(() => {
    const update = () => {
      const rect = id ? runtime.rectangle(id) : null
      const canvas = runtime.canvas?.getBoundingClientRect()
      if (!target.current) return
      target.current.hidden =
        !rect ||
        !canvas ||
        rect.width < 64 ||
        rect.height < 40 ||
        (runtime.interacting && !useTopicWidthPreview.getState().preview)
      if (!rect || !canvas) return
      const node = runtime.model.layout.nodes.find((item) => item.id === id)
      const current = useTopicWidthPreview.getState().preview
      const width =
        node && current && current.topic.id === id
          ? (current.width * rect.width) / node.width
          : rect.width
      const height =
        node && current && current.topic.id === id
          ? (current.height * rect.height) / node.height
          : rect.height
      const x =
        current && current.topic.id === id && current.fixedEdge === 'right'
          ? rect.x + rect.width - width
          : rect.x
      Object.assign(target.current.style, {
        transform: `translate(${x - canvas.left}px,${rect.y - canvas.top}px)`,
        width: `${width}px`,
        height: `${height}px`,
      })
    }
    update()
    const unsubscribe = runtime.subscribe(update)
    const stopPreview = useTopicWidthPreview.subscribe(update)
    return () => {
      unsubscribe()
      stopPreview()
    }
  }, [runtime, id, ready, preview])
  if (!id || !ready) return null
  return (
    <>
      {preview?.topic.id === id && <SpatialTopicWidthPreview runtime={runtime} preview={preview} />}
      <div
        ref={target}
        className="pointer-events-none absolute top-0 left-0 z-30"
        data-spatial-topic-controls
      >
        {(['left', 'right'] as const).map((side) => (
          <Button
            key={side}
            type="button"
            variant="outline"
            size="icon"
            aria-label={translate(side === 'left' ? 'resizeTopicWidthLeft' : 'resizeTopicWidth')}
            className={`pointer-events-auto absolute top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-background bg-ring p-0 shadow-sm transition-none ${side === 'left' ? '-left-3' : '-right-3'}`}
            onPointerDown={(event) => {
              begin(event, id, side)
            }}
          />
        ))}
        <div ref={add} className="pointer-events-none absolute">
          <TopicNearbyAdd id={id} />
        </div>
      </div>
    </>
  )
}
