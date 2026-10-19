import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useMessages } from '@renderer/i18n/useMessages'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import { PresentationNavigation } from '@renderer/components/presentation/PresentationNavigation'
import { PresentationStage } from '@renderer/components/presentation/PresentationStage'

interface PresentationAudienceProps {
  fullscreen: boolean
  fullscreenAvailable: boolean
  toggleFullscreen: () => void
}

export const PresentationAudience = (props: PresentationAudienceProps) => {
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const { steps, index, itemIndex } = usePresentation()
  const step = steps[index]
  const slide = step ? buildPresentationSlide(document, step) : null
  if (!slide) return null
  return (
    <section
      className="group relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[#15171c] p-4 outline-none sm:p-8"
      aria-label={translate('presentationAudience')}
      data-presentation-surface
      tabIndex={-1}
    >
      <div className="w-full max-w-[min(1600px,calc((100dvh-8rem)*16/9))]">
        <PresentationStage pageKey={`${index}:${step?.topicId}`}>
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
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 pt-12 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
        <div className="flex flex-col items-center gap-2">
          <PresentationNavigation {...props} />
          <p className="text-xs text-white/50">{translate('presentationNavigationHint')}</p>
        </div>
      </div>
    </section>
  )
}
