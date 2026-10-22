import type { MindMapDocument, Topic, PresentationTextStyle } from '@core'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
import { MarkerIcon } from '@renderer/components/metadata/MarkerIcon'
import { RichTitleDisplay } from '@renderer/components/metadata/RichTitleDisplay'
import { getAssetUrl } from '@renderer/lib/resource'
import { slideTextAppearance } from '@renderer/components/presentation/slideAppearance'
import { topicAppearance } from '@shared/appearance'

interface SlideTopicProps {
  document: MindMapDocument
  topic: Topic
  image: boolean
  compact?: boolean
  agenda?: boolean
  textStyle?: PresentationTextStyle | undefined
  imageFit?: 'contain' | 'cover'
}

/** Topic shapes become small branch identifiers, rather than stretched slide-sized containers. */
export const SlideTopic = ({
  document,
  topic,
  image,
  compact = false,
  agenda = false,
  textStyle,
  imageFit = 'contain',
}: SlideTopicProps) => {
  const asset = topic.image ? document.assets?.[topic.image.assetId] : undefined
  const shape = topic.style?.shape ?? 'rounded'
  const appearance = topicAppearance(document, topic.id)
  const children = topic.children.flatMap((id) =>
    document.topics[id] ? [document.topics[id]] : [],
  )
  return (
    <article
      className={`flex min-h-0 min-w-0 gap-[1.5cqw] ${agenda || compact ? 'flex-row items-start border-b border-[var(--slide-line)] py-[1.1cqw] last:border-b-0' : 'flex-col border-t border-[var(--slide-line)] pt-[1.4cqw]'}`}
      data-topic-shape={shape}
    >
      <div className="relative mt-[0.3cqw] flex h-[2.5cqw] w-[3.4cqw] shrink-0 items-center justify-center">
        <TopicShapeVisual
          shape={shape === 'text' || shape === 'image' ? 'rounded' : shape}
          fill={appearance.fill}
          stroke={appearance.stroke}
          width={68}
          height={50}
          className="absolute inset-0 size-full"
        />
        {topic.metadata?.markers?.[0] && (
          <span className="relative" style={{ color: appearance.color }}>
            <MarkerIcon marker={topic.metadata.markers[0]} className="size-[1.5cqw]" />
          </span>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[0.85cqw] overflow-hidden">
        <h3
          className={`${agenda ? 'line-clamp-2 text-[2.15cqw]' : compact ? 'line-clamp-2 text-[2.05cqw]' : 'line-clamp-3 text-[2.3cqw]'} break-words font-semibold leading-[1.35] tracking-[-0.02em] text-[var(--slide-fg)]`}
          style={{
            fontStyle: topic.style?.italic ? 'italic' : undefined,
            ...slideTextAppearance(textStyle, agenda ? 2.15 : compact ? 2.05 : 2.3),
            fontWeight:
              textStyle?.bold === false ||
              (textStyle?.bold === undefined && topic.style?.bold === false)
                ? 400
                : 600,
          }}
        >
          {topic.metadata?.richTitle ? (
            <RichTitleDisplay source={topic.metadata.richTitle} />
          ) : (
            topic.title
          )}
        </h3>
        {image && asset && (
          <img
            className="min-h-0 w-full flex-1 object-left"
            style={{ objectFit: imageFit }}
            src={getAssetUrl(asset)}
            alt={topic.title}
            loading="lazy"
          />
        )}
        {!agenda && !compact && children.length > 0 && (
          <ul
            style={{ ...slideTextAppearance(textStyle, 1.55), fontWeight: 400 }}
            className="space-y-[0.6cqw] text-[1.55cqw] leading-relaxed text-[var(--slide-muted)]"
          >
            {children.slice(0, 3).map((child) => (
              <li key={child.id} className="flex items-start gap-[0.7cqw]">
                <span
                  aria-hidden
                  className="mt-[0.65em] size-[0.3cqw] shrink-0 rounded-full bg-current"
                />
                <span className="line-clamp-2 break-words">{child.title}</span>
              </li>
            ))}
            {children.length > 3 && <li>+{children.length - 3}</li>}
          </ul>
        )}
        {!agenda && topic.notes && children.length === 0 && !asset && (
          <p
            style={{ ...slideTextAppearance(textStyle, 1.5), fontWeight: 400 }}
            className={`${compact ? 'line-clamp-1' : 'line-clamp-3'} whitespace-pre-line break-words text-[1.5cqw] leading-relaxed text-[var(--slide-muted)]`}
          >
            {topic.notes}
          </p>
        )}
      </div>
    </article>
  )
}
