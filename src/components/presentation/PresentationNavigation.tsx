import {
  ArrowLeft,
  ArrowRight,
  Maximize,
  Minimize,
  Monitor,
  Presentation,
  Square,
} from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import {
  advancePresentation,
  setPresentationMode,
  stopPresentation,
  usePresentation,
  presentationItemCount,
} from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'

interface PresentationNavigationProps {
  fullscreen: boolean
  fullscreenAvailable: boolean
  toggleFullscreen: () => void
}

export const PresentationNavigation = ({
  fullscreen,
  fullscreenAvailable,
  toggleFullscreen,
}: PresentationNavigationProps) => {
  const { translate } = useMessages()
  const { index, itemIndex, steps, workspaceMode } = usePresentation()
  const document = useEditor((state) => state.history.document)
  const step = steps[index]
  const count = step ? presentationItemCount(document, step) : 0
  const items = step?.reveal === 'items' || count > 6 ? count : 0
  const minimum = step?.reveal !== 'items' && count > 6 ? 6 : 0
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border bg-background/95 px-3 py-2 text-foreground shadow-lg backdrop-blur"
      role="toolbar"
      aria-label={translate('presentationPlaybackControls')}
      data-presentation-controls
    >
      <Button
        variant="ghost"
        size="icon"
        disabled={index === 0 && itemIndex <= minimum}
        onClick={() => {
          advancePresentation(-1)
        }}
        aria-label={translate('previousPresentationStep')}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">
        {index + 1} / {steps.length}
      </span>
      <Button
        variant="ghost"
        size="icon"
        disabled={index === steps.length - 1 && itemIndex >= items}
        onClick={() => {
          advancePresentation(1)
        }}
        aria-label={translate('nextPresentationStep')}
      >
        <ArrowRight className="size-4" />
      </Button>
      <div className="mx-1 h-5 border-l" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setPresentationMode(workspaceMode === 'presenter' ? 'audience' : 'presenter')
        }}
      >
        {workspaceMode === 'presenter' ? (
          <Monitor className="size-4" />
        ) : (
          <Presentation className="size-4" />
        )}
        <span className="hidden sm:inline">
          {translate(
            workspaceMode === 'presenter' ? 'presentationAudience' : 'presentationPresenter',
          )}
        </span>
      </Button>
      {fullscreenAvailable && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={translate(fullscreen ? 'exitFullScreen' : 'presentFullScreen')}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={stopPresentation}
        aria-label={translate('exitPresentation')}
      >
        <Square className="size-3.5" />
        {translate('exit')}
      </Button>
    </div>
  )
}
