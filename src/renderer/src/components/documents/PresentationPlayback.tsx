import { useMessages } from '@renderer/i18n/useMessages'

import { ArrowLeft, ArrowRight, Maximize, Minimize, Square } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { showPresentationStep, stopPresentation } from '@renderer/state/presentation'
import { usePresentationPlayback } from '@renderer/hooks/usePresentationPlayback'
import { Button } from '@renderer/components/ui/button'

export const PresentationPlayback = () => {
  const { translate } = useMessages()

  const { presentation, fullscreen, toggleFullscreen } = usePresentationPlayback()
  const title = useEditor(
    (state) =>
      state.history.document.topics[presentation.steps[presentation.index]?.topicId ?? '']?.title,
  )
  if (!presentation.playing) return null
  return (
    <div
      className="absolute inset-x-4 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label={translate('presentationPlaybackControls')}
      data-presentation-controls
      tabIndex={-1}
    >
      <div className="max-w-56 px-2">
        <p className="truncate text-sm font-medium" aria-live="polite">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {presentation.index + 1} / {presentation.steps.length}
          {presentation.generated ? translate('automaticPresentationLabel215') : ''}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={translate('previousPresentationStep')}
        disabled={presentation.index === 0}
        onClick={() => {
          showPresentationStep(presentation.index - 1)
        }}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={translate('nextPresentationStep')}
        disabled={presentation.index >= presentation.steps.length - 1}
        onClick={() => {
          showPresentationStep(presentation.index + 1)
        }}
      >
        <ArrowRight className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={fullscreen ? translate('exitFullScreen') : translate('presentFullScreen')}
        onClick={toggleFullscreen}
      >
        {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label={translate('exitPresentation')}
        onClick={stopPresentation}
      >
        <Square className="size-3.5" />
        {translate('exit')}
      </Button>
      <span className="hidden px-1 text-xs text-muted-foreground sm:inline">
        {translate('arrowKeysToNavigateEscToExit')}
      </span>
    </div>
  )
}
