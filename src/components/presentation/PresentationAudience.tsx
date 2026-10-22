import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useMessages } from '@renderer/i18n/useMessages'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import { PresentationNavigation } from '@renderer/components/presentation/PresentationNavigation'
import { PresentationStage } from '@renderer/components/presentation/PresentationStage'
import { usePresentationChrome } from '@renderer/components/presentation/usePresentationChrome'
import { useState } from 'react'

interface PresentationAudienceProps {
  fullscreen: boolean
  fullscreenAvailable: boolean
  toggleFullscreen: () => void
}

export const PresentationAudience = (props: PresentationAudienceProps) => {
  const { translate } = useMessages()
  const [pageJumpOpen, setPageJumpOpen] = useState(false)
  const { controlsRef, visible } = usePresentationChrome(pageJumpOpen)
  const document = useEditor((state) => state.history.document)
  const { steps, index, itemIndex } = usePresentation()
  const step = steps[index]
  const slide = step ? buildPresentationSlide(document, step) : null
  if (!slide) return null
  return (
    <section
      className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[#15171c] p-4 outline-none sm:p-8"
      aria-label={translate('presentationAudience')}
      data-presentation-surface
      tabIndex={-1}
    >
      <div className="w-full max-w-[min(1600px,calc((100dvh-8rem)*16/9))]">
        <PresentationStage pageKey={`${index}:${step?.topicId}`} index={index}>
          <PresentationSlide
            document={document}
            slide={slide}
            index={index}
            total={steps.length}
            revealed={step?.reveal === 'items' || slide.items.length > 6 ? itemIndex : undefined}
            animate
          />
        </PresentationStage>
      </div>
      <div
        data-presentation-chrome={visible ? 'visible' : 'hidden'}
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5 pt-12 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <div
          ref={controlsRef}
          className={`flex flex-col items-center gap-2 ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <PresentationNavigation {...props} onPageJumpOpenChange={setPageJumpOpen} />
          <p className="text-[11px] font-medium tracking-wide text-white/70">
            {translate('presentationNavigationHint')}
          </p>
        </div>
      </div>
    </section>
  )
}
