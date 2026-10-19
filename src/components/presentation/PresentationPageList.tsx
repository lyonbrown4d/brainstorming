import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { EyeOff } from 'lucide-react'
import type { MindMapDocument, PresentationStep } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'

interface PresentationPageListProps {
  document: MindMapDocument
  steps: readonly PresentationStep[]
  selected: number
  onSelect: (index: number) => void
}

export const PresentationPageList = ({
  document,
  steps,
  selected,
  onSelect,
}: PresentationPageListProps) => {
  'use no memo'
  const { translate } = useMessages()
  const scroll = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({
    count: steps.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 160,
    overscan: 2,
  })
  return (
    <aside
      className="flex w-52 shrink-0 flex-col border-r bg-background max-lg:w-40 max-sm:hidden"
      aria-label={translate('presentationPages')}
    >
      <h2 className="border-b px-4 py-4 text-sm font-semibold">
        {translate('presentationPages')}{' '}
        <span className="ml-2 font-normal text-muted-foreground">{steps.length}</span>
      </h2>
      <div ref={scroll} className="min-h-0 flex-1 overflow-auto p-3">
        <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map((row) => {
            const step = steps[row.index]
            const slide = step ? buildPresentationSlide(document, step) : null
            if (!slide || !step) return null
            return (
              <button
                key={row.key}
                type="button"
                aria-label={`${row.index + 1}. ${slide.topic.title}${step.hidden ? ` · ${translate('presentationHidden')}` : ''}`}
                onClick={() => {
                  onSelect(row.index)
                }}
                aria-current={row.index === selected ? 'page' : undefined}
                className={`absolute left-0 top-0 w-full rounded-xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${row.index === selected ? 'border-primary bg-muted ring-1 ring-primary' : 'border-border bg-background hover:bg-muted/50'} ${step.hidden ? 'opacity-55' : ''}`}
                style={{ height: row.size - 10, transform: `translateY(${row.start}px)` }}
              >
                <div className="mb-2 flex min-w-0 items-center gap-2 text-xs font-medium">
                  <span className="text-muted-foreground">{row.index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{slide.topic.title}</span>
                  {step.hidden && (
                    <EyeOff
                      className="size-3 shrink-0"
                      aria-label={translate('presentationHidden')}
                    />
                  )}
                </div>
                <div className="pointer-events-none overflow-hidden rounded border [&_article]:p-1">
                  <PresentationSlide
                    document={document}
                    slide={slide}
                    index={row.index}
                    total={steps.length}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
