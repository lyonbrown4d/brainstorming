import type { MindMapDocument } from '@core'
import type { PresentationSlide as SlideModel } from '@renderer/components/presentation/slideModel'
import { SlideItems } from '@renderer/components/presentation/SlideItems'
import {
  slideAppearance,
  slideTextAppearance,
} from '@renderer/components/presentation/slideAppearance'
import { RichTitleDisplay } from '@renderer/components/metadata/RichTitleDisplay'
import { getAssetUrl } from '@renderer/lib/resource'

interface PresentationSlideProps {
  document: MindMapDocument
  slide: SlideModel
  index: number
  total: number
  revealed?: number | undefined
  animate?: boolean
}

export const PresentationSlide = ({
  document,
  slide,
  index,
  total,
  revealed,
  animate = false,
}: PresentationSlideProps) => {
  const cover =
    !slide.topic.image &&
    slide.topic.id === document.rootId &&
    (!slide.step.layout || slide.step.layout === 'auto')
  const asset = slide.topic.image ? document.assets?.[slide.topic.image.assetId] : undefined
  const hasItems = slide.items.length > 0
  const image = slide.layout === 'image' && asset
  const focus = !hasItems && !image
  const title = slide.topic.metadata?.richTitle ? (
    <RichTitleDisplay source={slide.topic.metadata.richTitle} />
  ) : (
    slide.topic.title
  )
  const titleSize =
    slide.topic.title.length > 48
      ? 2.7
      : slide.topic.title.length > 26
        ? 3.8
        : slide.topic.title.length > 12
          ? 5
          : 6.2
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-sm bg-[var(--slide-bg)] text-[var(--slide-fg)] shadow-sm [container-type:inline-size]"
      style={slideAppearance(document, slide.step)}
      data-presentation-slide
      data-slide-composition={cover ? 'cover' : focus ? 'focus' : image ? 'image' : slide.layout}
      aria-label={slide.topic.title}
    >
      {cover && (
        <div
          className={`absolute inset-y-0 left-0 bg-[var(--slide-cover)] ${hasItems ? 'w-[52%]' : 'w-full'}`}
        />
      )}
      <div className="absolute inset-0 flex flex-col px-[5.5%] py-[4%]">
        {cover || focus ? (
          <div className={`flex min-h-0 flex-1 items-center ${hasItems ? 'gap-[8%]' : ''}`}>
            <header
              className={`flex min-h-0 flex-col justify-center ${hasItems ? 'w-[48%] shrink-0 pr-[3%]' : 'w-[88%]'} ${cover ? 'text-[var(--slide-cover-fg)]' : ''}`}
            >
              <h2
                style={slideTextAppearance(slide.step.appearance?.title, titleSize)}
                className={`line-clamp-7 break-words font-semibold leading-[1.18] tracking-[-0.035em] [text-wrap:balance]`}
              >
                {title}
              </h2>
              {!cover && slide.topic.notes && (
                <p
                  style={slideTextAppearance(slide.step.appearance?.body, 1.9)}
                  className="mt-[2.5cqw] line-clamp-5 max-w-[58ch] whitespace-pre-line break-words text-[1.9cqw] leading-relaxed text-[var(--slide-muted)]"
                >
                  {slide.topic.notes}
                </p>
              )}
            </header>
            {hasItems && (
              <div className="h-[88%] min-h-0 min-w-0 flex-1">
                <SlideItems
                  document={document}
                  slide={slide}
                  revealed={revealed}
                  animate={animate}
                  agenda
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <header className="mb-[3cqw] shrink-0">
              <h2
                style={slideTextAppearance(slide.step.appearance?.title, 4)}
                className="line-clamp-2 break-words text-[4cqw] font-semibold leading-[1.2] tracking-[-0.03em] [text-wrap:balance]"
              >
                {title}
              </h2>
            </header>
            <div
              className={`flex min-h-0 flex-1 gap-[4cqw] ${slide.step.appearance?.image?.position === 'right' ? 'flex-row-reverse' : ''}`}
            >
              {image && (
                <figure
                  className={`flex h-full min-w-0 items-center justify-center ${hasItems ? 'w-[44%] shrink-0' : 'w-full'}`}
                >
                  <img
                    src={getAssetUrl(asset)}
                    alt={slide.topic.title}
                    className="size-full"
                    style={{ objectFit: slide.step.appearance?.image?.fit ?? 'contain' }}
                  />
                </figure>
              )}
              {hasItems && (
                <SlideItems
                  document={document}
                  slide={slide}
                  revealed={revealed}
                  animate={animate}
                  agenda={Boolean(image)}
                />
              )}
            </div>
          </>
        )}
        <footer className="relative mt-[2.5cqw] flex shrink-0 items-center justify-between gap-[3cqw] text-[1.15cqw] leading-none">
          <span
            className={`max-w-[44%] truncate ${cover ? 'text-[var(--slide-cover-muted)]' : 'text-[var(--slide-muted)]'}`}
          >
            {cover ? document.title : `${document.title} / ${slide.topic.title}`}
          </span>
          <span
            className={`flex items-center gap-[1.4cqw] tabular-nums ${cover && !hasItems ? 'text-[var(--slide-cover-muted)]' : 'text-[var(--slide-muted)]'}`}
          >
            {slide.items.length > 6 && (
              <span>
                {Math.min(revealed ?? 6, slide.items.length)} / {slide.items.length} ·
              </span>
            )}
            {String(index + 1).padStart(2, '0')}
            <span aria-hidden className="h-[0.65cqw] w-[3cqw] border-t border-current opacity-40" />
            {String(total).padStart(2, '0')}
          </span>
        </footer>
      </div>
    </div>
  )
}
