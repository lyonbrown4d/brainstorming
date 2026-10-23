import { useLayoutEffect, useRef } from 'react'
import type {
  IndependentSpatialRuntime,
  SpatialSceneModel,
} from '@renderer/lib/independentSpatialRuntime'
import { useEditor } from '@renderer/state/editor'
import { TopicNodeBody } from '@renderer/components/TopicNodeBody'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
import { topicAppearance } from '@shared/appearance'
import { topicShapeInsets } from '@shared/topic-shapes'

/** Mount the same Lexical editor only for the actively edited Three topic. */
export const IndependentSpatialEditor = ({
  runtime,
  model,
}: {
  runtime: IndependentSpatialRuntime
  model: SpatialSceneModel
}) => {
  const id = useEditor((state) => (state.editingSurface === 'canvas' ? state.editingId : null))
  const document = useEditor((state) => state.history.document)
  const element = useRef<HTMLDivElement>(null)
  const topic = id ? document.topics[id] : undefined
  useLayoutEffect(() => {
    const host = element.current
    if (!id || !topic || !host) return
    runtime.freezeCamera()
    runtime.hiddenTopics.add(id)
    runtime.changed()
    const position = () => {
      const rect = runtime.rectangle(id)
      const node = runtime.model.layout.nodes.find((item) => item.id === id)
      const root = runtime.canvas?.getBoundingClientRect()
      if (!rect || !node || !root || !element.current) return
      element.current.style.transform = `translate(${rect.x - root.left}px,${rect.y - root.top}px) scale(${rect.width / node.width})`
      element.current.style.width = `${node.width}px`
      element.current.style.height = `${node.height}px`
    }
    position()
    const stop = runtime.subscribe(position)
    return () => {
      const ownedFocus = host.contains(window.document.activeElement)
      stop()
      runtime.hiddenTopics.delete(id)
      runtime.changed()
      if (ownedFocus)
        queueMicrotask(() => {
          if (
            !useEditor.getState().editingId &&
            window.document.activeElement === window.document.body
          )
            window.document.getElementById('sheet-panel')?.focus({ preventScroll: true })
        })
    }
  }, [runtime, id, topic, model.layout])
  if (!id || !topic) return null
  const appearance = topicAppearance(document, id, runtime.model.surface)
  const layout = model.layout.nodes.find((item) => item.id === id)
  if (!layout) return null
  const root = id === document.rootId
  const branch = document.topics[document.rootId]?.children.includes(id) ?? false
  const insets = topicShapeInsets(topic.style?.shape)
  const scale = topic.style?.scale ?? 1
  return (
    <div
      ref={element}
      className="topic is-selected is-editing absolute top-0 left-0 z-20 origin-top-left"
      data-spatial-editor
      data-topic-id={id}
      style={{ color: appearance.color, fontFamily: appearance.fontFamily }}
    >
      <div
        className="relative origin-top-left"
        style={{
          width: layout.width / scale,
          height: layout.height / scale,
          transform: `scale(${scale})`,
        }}
      >
        <TopicShapeVisual
          shape={topic.style?.shape ?? 'rectangle'}
          fill={appearance.fill}
          stroke={appearance.stroke}
          visualStyle={document.settings?.visualStyle}
          sketchFill={root || branch || Boolean(topic.style?.fill)}
          seedKey={id}
          width={layout.width / scale}
          height={layout.height / scale}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div
          className="absolute flex min-h-0 flex-col items-center"
          style={{
            top: `${insets.y * 100}%`,
            bottom: `${insets.y * 100}%`,
            left: `${insets.x * 100}%`,
            right: `${insets.x * 100}%`,
          }}
        >
          <TopicNodeBody topic={topic} root={root} branch={branch} primary editing />
        </div>
      </div>
    </div>
  )
}
