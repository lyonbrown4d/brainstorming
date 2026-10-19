import type { MindMapDocument, Topic } from '@core'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
import { getAssetUrl } from '@renderer/lib/resource'
import { topicShapeInsets } from '@shared/topic-shapes'
import { topicAppearance } from '@shared/appearance'

interface SlideTopicProps {
  document: MindMapDocument
  topic: Topic
  image: boolean
  compact?: boolean
}

export const SlideTopic = ({ document, topic, image, compact = false }: SlideTopicProps) => {
  const asset = topic.image ? document.assets?.[topic.image.assetId] : undefined
  const shape = topic.style?.shape ?? 'rounded'
  const inset = topicShapeInsets(shape)
  const appearance = topicAppearance(document, topic.id)
  const children = topic.children.flatMap((id) =>
    document.topics[id] ? [document.topics[id]] : [],
  )
  return (
    <article className="relative flex min-h-0 min-w-0 flex-col gap-3 p-5" data-topic-shape={shape}>
      <TopicShapeVisual
        shape={shape}
        fill={appearance.fill}
        stroke={topic.id === document.rootId ? appearance.fill : appearance.stroke}
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        className="absolute flex min-h-0 flex-col gap-2 overflow-hidden"
        style={{
          color: appearance.color,
          fontFamily: appearance.fontFamily,
          fontStyle: topic.style?.italic ? 'italic' : undefined,
          top: `${Math.max(5, inset.y * 100)}%`,
          bottom: `${Math.max(5, inset.y * 100)}%`,
          left: `${Math.max(5, inset.x * 100)}%`,
          right: `${Math.max(5, inset.x * 100)}%`,
        }}
      >
        <h3
          className="line-clamp-3 break-words text-[1.8cqw] font-semibold leading-snug"
          style={{ fontWeight: topic.style?.bold === false ? 400 : 600 }}
        >
          {topic.title}
        </h3>
        {image && asset && (
          <img
            className="min-h-0 w-full flex-1 rounded-lg object-cover"
            src={getAssetUrl(asset)}
            alt={topic.title}
            loading="lazy"
          />
        )}
        {!compact && children.length > 0 && (
          <ul className="space-y-1 text-[1.3cqw] leading-snug text-slate-600">
            {children.slice(0, 3).map((child) => (
              <li key={child.id} className="line-clamp-2 break-words">
                {child.title}
              </li>
            ))}
            {children.length > 3 && <li>+{children.length - 3}</li>}
          </ul>
        )}
        {!compact && topic.notes && (
          <p className="line-clamp-3 whitespace-pre-line break-words text-[1.2cqw] leading-relaxed text-slate-500">
            {topic.notes}
          </p>
        )}
      </div>
    </article>
  )
}
