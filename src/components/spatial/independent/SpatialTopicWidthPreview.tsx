import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import type { TopicWidthPreview } from '@renderer/state/topicWidthPreview'
import { TopicNodeBody } from '@renderer/components/TopicNodeBody'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
import { topicAppearance } from '@shared/appearance'
import { DEFAULT_TOPIC_SHAPE, topicOutlineColor, topicShapeInsets } from '@shared/topic-shapes'

/** Only the actively resized topic gets a reflowing DOM preview, never a second canvas. */
export const SpatialTopicWidthPreview = ({
  runtime,
  preview,
}: {
  runtime: IndependentSpatialRuntime
  preview: TopicWidthPreview
}) => {
  const document = runtime.model.document
  const { topic, width, height } = preview
  const rect = runtime.rectangle(topic.id)
  const layout = runtime.model.layout.nodes.find((node) => node.id === topic.id)
  const canvas = runtime.canvas?.getBoundingClientRect()
  if (!rect || !layout || !canvas) return null
  const appearance = topicAppearance(document, topic.id, runtime.model.surface)
  const root = topic.id === document.rootId
  const branch = document.topics[document.rootId]?.children.includes(topic.id) ?? false
  const scale = topic.style?.scale ?? 1
  const insets = topicShapeInsets(topic.style?.shape)
  const screenWidth = (width * rect.width) / layout.width
  const x = preview.fixedEdge === 'right' ? rect.x + rect.width - screenWidth : rect.x
  return (
    <div
      className="topic is-selected pointer-events-none absolute top-0 left-0 z-20 origin-top-left"
      data-spatial-width-preview
      style={{
        width: width / scale,
        height: height / scale,
        transform: `translate(${x - canvas.left}px,${rect.y - canvas.top}px) scale(${(rect.width / layout.width) * scale})`,
        color: appearance.color,
        fontFamily: appearance.fontFamily,
      }}
    >
      <TopicShapeVisual
        shape={topic.style?.shape ?? DEFAULT_TOPIC_SHAPE}
        fill={appearance.fill}
        stroke={topicOutlineColor({
          ...appearance,
          root,
          visualStyle: document.settings?.visualStyle,
        })}
        visualStyle={document.settings?.visualStyle}
        sketchFill={root || branch || Boolean(topic.style?.fill) || topic.style?.shape === 'sticky'}
        seedKey={topic.id}
        width={width / scale}
        height={height / scale}
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
        <TopicNodeBody topic={topic} root={root} branch={branch} primary={false} editing={false} />
      </div>
    </div>
  )
}
