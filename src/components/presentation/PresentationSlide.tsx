import { motion, useReducedMotion } from 'motion/react'
import type { MindMapDocument } from '@core'
import type { PresentationSlide as SlideModel } from '@renderer/components/presentation/slideModel'
import { slideItemWindow } from '@renderer/components/presentation/slideModel'
import { SlideTopic } from '@renderer/components/presentation/SlideTopic'
import { getAssetUrl } from '@renderer/lib/resource'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

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
  const reduced = useReducedMotion()
  const items = slideItemWindow(slide, revealed)
  const asset = slide.topic.image ? document.assets?.[slide.topic.image.assetId] : undefined
  const hasItems = slide.items.length > 0
  const slots = Math.min(6, slide.items.length)
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-white text-slate-950 shadow-sm [container-type:inline-size]"
      data-presentation-slide
      aria-label={slide.topic.title}
    >
      <div className="absolute inset-0 flex flex-col px-[4.5%] py-[3.5%]">
        <header className="mb-[3%] shrink-0">
          <h2 className="line-clamp-2 break-words text-[3.5cqw] font-semibold leading-tight tracking-tight">
            {slide.topic.title}
          </h2>
          {slide.topic.id !== document.rootId && (
            <p className="mt-[0.7%] truncate text-[1.6cqw] text-slate-500">{document.title}</p>
          )}
        </header>
        <div className="flex min-h-0 flex-1 gap-[3%]">
          {slide.layout === 'image' && asset && (
            <img
              src={getAssetUrl(asset)}
              alt={slide.topic.title}
              className="h-full w-[42%] rounded-xl object-cover"
            />
          )}
          {hasItems ? (
            <div
              className={`grid min-h-0 flex-1 gap-[2%] ${slide.layout === 'structure' ? 'border-t-2 border-teal-500/70 pt-[3%]' : ''} ${slide.layout === 'list' || slots === 1 ? 'grid-cols-1' : slots === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
              style={{
                gridTemplateRows: `repeat(${slide.layout === 'list' ? slots : slots > 3 ? 2 : 1}, minmax(0, 1fr))`,
              }}
            >
              {items.map((topic) => {
                const content = (
                  <SlideTopic
                    document={document}
                    topic={topic}
                    image={slide.layout === 'image' || slide.layout === 'structure'}
                    compact={slide.layout === 'list'}
                  />
                )
                return animate ? (
                  <motion.div
                    key={topic.id}
                    className="min-h-0 min-w-0 [&>article]:h-full"
                    initial={!reduced ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduced ? noMotion : workbenchMotion.item}
                  >
                    {content}
                  </motion.div>
                ) : (
                  <div key={topic.id} className="min-h-0 min-w-0 [&>article]:h-full">
                    {content}
                  </div>
                )
              })}
            </div>
          ) : (
            !asset && (
              <div className="flex flex-1 items-center justify-center">
                <p className="max-w-[85%] whitespace-pre-line break-words text-center text-[2cqw] leading-relaxed text-slate-600">
                  {slide.topic.notes ?? slide.topic.title}
                </p>
              </div>
            )
          )}
        </div>
        <footer className="mt-[3%] flex shrink-0 items-center justify-between text-[1.1cqw] text-slate-500">
          <span className="max-w-[70%] truncate">{document.title}</span>
          <span>
            {slide.items.length > 6
              ? `${Math.min(revealed ?? 6, slide.items.length)} / ${slide.items.length} · `
              : ''}
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </footer>
      </div>
    </div>
  )
}
