import { Clock3, MessageSquareText } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useMessages } from '@renderer/i18n/useMessages'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import { PresentationNavigation } from '@renderer/components/presentation/PresentationNavigation'
import { usePresentationTimer } from '@renderer/components/presentation/usePresentationTimer'
import { PresentationStage } from '@renderer/components/presentation/PresentationStage'

interface PresentationPresenterProps {
  fullscreen: boolean
  fullscreenAvailable: boolean
  toggleFullscreen: () => void
}

const PresentationElapsed = ({ startedAt }: { startedAt: number | null }) => {
  const { translate } = useMessages()
  const timer = usePresentationTimer(startedAt)
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock3 className="size-4" />
      {translate('presentationElapsed')}
      <span className="text-lg font-medium tabular-nums text-foreground">{timer}</span>
    </p>
  )
}

export const PresentationPresenter = (props: PresentationPresenterProps) => {
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const { steps, index, itemIndex, startedAt } = usePresentation()
  const step = steps[index]
  const next = steps[index + 1]
  const slide = step ? buildPresentationSlide(document, step) : null
  const nextSlide = next ? buildPresentationSlide(document, next) : null
  if (!slide) return null
  const nextItem =
    step?.reveal === 'items' || slide.items.length > 6 ? slide.items[itemIndex] : undefined
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-muted/50 p-5 outline-none"
      aria-label={translate('presentationPresenter')}
      tabIndex={-1}
      data-presentation-surface
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-base font-semibold">{translate('presentationPresenter')}</h1>
        <PresentationElapsed startedAt={startedAt} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-5 overflow-auto max-md:grid-cols-1">
        <main className="flex min-w-0 flex-col gap-4">
          <h2 className="text-sm text-muted-foreground">
            {translate('presentationCurrentPage')} · {index + 1} / {steps.length}
          </h2>
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
          <div className="min-h-32 flex-1 rounded-xl border bg-background p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="size-4" />
              {translate('presentationNotes')}
            </h2>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
              {slide.notes || translate('presentationNoNotes')}
            </p>
          </div>
        </main>
        <aside className="flex min-w-0 flex-col gap-4">
          <h2 className="text-sm text-muted-foreground">{translate('presentationNextPage')}</h2>
          {nextSlide ? (
            <PresentationSlide
              document={document}
              slide={nextSlide}
              index={index + 1}
              total={steps.length}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground">
              {translate('presentationFinished')}
            </div>
          )}
          <div className="rounded-xl border bg-background p-5">
            <h2 className="mb-3 text-sm font-semibold">{translate('presentationNextItem')}</h2>
            <p className="break-words text-lg font-medium">
              {nextItem?.title ?? nextSlide?.topic.title ?? translate('presentationFinished')}
            </p>
          </div>
        </aside>
      </div>
      <div className="mt-5 flex shrink-0 justify-center">
        <PresentationNavigation {...props} />
      </div>
    </section>
  )
}
