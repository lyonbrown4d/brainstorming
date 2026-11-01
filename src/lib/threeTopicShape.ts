import type { Topic } from '@core'
import type { SpatialSceneModel } from '@renderer/lib/independentSpatialRuntime'
import { topicAppearance } from '@shared/appearance'
import { DEFAULT_TOPIC_SHAPE, topicOutlineColor } from '@shared/topic-shapes'
import { sketchFillPath, topicOutlinePath, visualPath } from '@shared/sketch'

/** Draw the same unscaled silhouette as TopicShapeVisual, then apply the document scale once. */
export const paintThreeTopicShape = (
  context: CanvasRenderingContext2D,
  model: SpatialSceneModel,
  topic: Topic,
  width: number,
  height: number,
): void => {
  const shape = topic.style?.shape ?? DEFAULT_TOPIC_SHAPE
  if (shape === 'text') return
  const scale = topic.style?.scale ?? 1
  const w = width / scale,
    h = height / scale
  const root = topic.id === model.document.rootId
  const branch = model.document.topics[model.document.rootId]?.children.includes(topic.id) ?? false
  const appearance = topicAppearance(model.document, topic.id, model.surface)
  const visualStyle = model.document.settings?.visualStyle
  const outline = topicOutlinePath(shape, w, h)
  context.save()
  context.scale(scale, scale)
  context.fillStyle = appearance.fill
  context.strokeStyle = topicOutlineColor({ ...appearance, root, visualStyle })
  context.fill(new Path2D(outline))
  if (
    visualStyle === 'sketch' &&
    (root || branch || Boolean(topic.style?.fill) || shape === 'sticky')
  ) {
    context.save()
    context.globalAlpha = 0.1
    context.lineWidth = 0.8
    context.stroke(new Path2D(sketchFillPath(outline, `topic:${topic.id}`)))
    context.restore()
  }
  context.lineWidth = 1.5
  context.stroke(new Path2D(visualPath(outline, visualStyle, `topic:${topic.id}`)))
  if (shape === 'sticky') {
    context.lineWidth = 1
    context.stroke(
      new Path2D(
        visualPath(`M${w * 0.84} ${h} V${h * 0.84} H${w}`, visualStyle, `topic:${topic.id}:fold`),
      ),
    )
  }
  if (shape === 'card') {
    context.lineWidth = 3
    context.stroke(
      new Path2D(
        visualPath(
          `M${w * 0.08} ${h * 0.12} H${w * 0.92}`,
          visualStyle,
          `topic:${topic.id}:header`,
        ),
      ),
    )
  }
  context.restore()
}
