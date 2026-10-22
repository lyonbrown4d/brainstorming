import { motion, useReducedMotion } from 'motion/react'
import type { MindMapDocument } from '@core'
import type { PresentationSlide } from '@renderer/components/presentation/slideModel'
import { slideItemWindow } from '@renderer/components/presentation/slideModel'
import { SlideTopic } from '@renderer/components/presentation/SlideTopic'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

export const SlideItems = ({
  document,
  slide,
  revealed,
  animate = false,
  agenda = false,
}: {
  document: MindMapDocument
  slide: PresentationSlide
  revealed?: number | undefined
  animate?: boolean
  agenda?: boolean
}) => {
  const reduced = useReducedMotion()
  const slots = Math.min(6, slide.items.length)
  const rows = agenda || slide.layout === 'list'
  const columns = rows || slots === 1 ? 1 : slots === 2 || slots === 4 ? 2 : 3
  return (
    <div
      className={`grid h-full min-h-0 min-w-0 flex-1 gap-x-[3cqw] ${rows ? 'gap-y-0' : 'gap-y-[2.5cqw]'} ${columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      style={{
        gridTemplateRows: `repeat(${rows ? slots : Math.ceil(slots / columns)}, minmax(0, 1fr))`,
      }}
    >
      {slideItemWindow(slide, revealed).map((topic, index) => (
        <motion.div
          key={topic.id}
          className="min-h-0 min-w-0 [&>article]:h-full"
          initial={
            animate && !reduced ? { opacity: 0, x: agenda ? 14 : 0, y: agenda ? 0 : 10 } : false
          }
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={
            reduced || !animate
              ? noMotion
              : {
                  ...workbenchMotion.item,
                  delay: revealed === undefined ? Math.min(index, 4) * 0.03 : 0,
                }
          }
        >
          <SlideTopic
            document={document}
            topic={topic}
            image={!agenda && (slide.layout === 'image' || slide.layout === 'structure')}
            compact={slide.layout === 'list'}
            agenda={agenda}
            textStyle={slide.step.appearance?.body}
            imageFit={slide.step.appearance?.image?.fit ?? 'contain'}
          />
        </motion.div>
      ))}
    </div>
  )
}
