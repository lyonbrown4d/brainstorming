import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Maximize,
  Minimize,
  Monitor,
  Presentation,
  Square,
} from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  advancePresentation,
  setPresentationMode,
  stopPresentation,
  usePresentation,
  presentationItemCount,
  showPresentationStep,
} from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'

interface PresentationNavigationProps {
  fullscreen: boolean
  fullscreenAvailable: boolean
  toggleFullscreen: () => void
  onPageJumpOpenChange?: (open: boolean) => void
}

export const PresentationNavigation = ({
  fullscreen,
  fullscreenAvailable,
  toggleFullscreen,
  onPageJumpOpenChange,
}: PresentationNavigationProps) => {
  const { translate } = useMessages()
  const [pageJumpOpen, setPageJumpOpen] = useState(false)
  const jumped = useRef(false)
  const { index, itemIndex, steps, workspaceMode } = usePresentation()
  const document = useEditor((state) => state.history.document)
  const step = steps[index]
  const count = step ? presentationItemCount(document, step) : 0
  const items = step?.reveal === 'items' || count > 6 ? count : 0
  const minimum = step?.reveal !== 'items' && count > 6 ? 6 : 0
  const changePageJump = (open: boolean) => {
    setPageJumpOpen(open)
    onPageJumpOpenChange?.(open)
  }
  return (
    <div
      className="flex max-w-[calc(100vw-2rem)] items-center gap-0.5 rounded-full border border-border/70 bg-background/95 px-1.5 py-1 text-foreground shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md"
      role="toolbar"
      aria-label={translate('presentationPlaybackControls')}
      data-presentation-controls
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        disabled={index === 0 && itemIndex <= minimum}
        onClick={() => {
          advancePresentation(-1)
        }}
        aria-label={translate('previousPresentationStep')}
        title={translate('previousPresentationStep')}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Popover open={pageJumpOpen} onOpenChange={changePageJump}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-w-18 gap-1 rounded-full px-2 text-xs font-semibold tabular-nums"
            aria-label={translate('presentationJumpToPage')}
            title={translate('presentationJumpToPage')}
            aria-expanded={pageJumpOpen}
          >
            <span aria-live="polite">{index + 1}</span>
            <span className="text-muted-foreground">/ {steps.length}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="top"
          sideOffset={10}
          className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-xl"
          data-presentation-page-jump
          onCloseAutoFocus={(event) => {
            if (!jumped.current) return
            event.preventDefault()
            jumped.current = false
            window.document
              .querySelector<HTMLElement>('[data-presentation-surface]')
              ?.focus({ preventScroll: true })
          }}
        >
          <Command>
            <CommandInput
              aria-label={translate('presentationJumpToPage')}
              placeholder={translate('presentationJumpToPage')}
            />
            <CommandList className="max-h-64 p-1">
              <CommandEmpty>{translate('presentationNoMatchingPages')}</CommandEmpty>
              {steps.map((page, pageIndex) => (
                <CommandItem
                  key={`${page.topicId}:${pageIndex}`}
                  value={`${pageIndex + 1} ${document.topics[page.topicId]?.title ?? ''}`}
                  onSelect={() => {
                    jumped.current = true
                    showPresentationStep(pageIndex)
                    changePageJump(false)
                  }}
                  className="gap-3 px-3 py-2.5"
                >
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {pageIndex + 1}
                  </span>
                  <span className="min-w-0 truncate">{document.topics[page.topicId]?.title}</span>
                  {pageIndex === index && (
                    <span className="ml-auto size-1.5 rounded-full bg-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        disabled={index === steps.length - 1 && itemIndex >= items}
        onClick={() => {
          advancePresentation(1)
        }}
        aria-label={translate('nextPresentationStep')}
        title={translate('nextPresentationStep')}
      >
        <ArrowRight className="size-4" />
      </Button>
      <div className="mx-1 h-4 border-l border-border/80" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        onClick={() => {
          setPresentationMode(workspaceMode === 'presenter' ? 'audience' : 'presenter')
        }}
        aria-label={translate(
          workspaceMode === 'presenter' ? 'presentationAudience' : 'presentationPresenter',
        )}
      >
        {workspaceMode === 'presenter' ? (
          <Monitor className="size-4" />
        ) : (
          <Presentation className="size-4" />
        )}
      </Button>
      {fullscreenAvailable && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          aria-label={translate(fullscreen ? 'exitFullScreen' : 'presentFullScreen')}
          title={translate(fullscreen ? 'exitFullScreen' : 'presentFullScreen')}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
      )}
      <div className="mx-1 h-4 border-l border-border/80" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        onClick={stopPresentation}
        aria-label={translate('exitPresentation')}
        title={translate('exitPresentation')}
      >
        <Square className="size-3.5" />
      </Button>
    </div>
  )
}
