import { Check, Play, Save } from 'lucide-react'
import type { PresentationStep } from '@core'
import { useEditor } from '@renderer/state/editor'
import {
  presentationSteps,
  selectPresentationPage,
  showPresentationStep,
  usePresentation,
} from '@renderer/state/presentation'
import { editPresentationPages } from '@renderer/state/presentationEditing'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'
import { PresentationPageList } from '@renderer/components/presentation/PresentationPageList'
import { PresentationPageSettings } from '@renderer/components/presentation/PresentationPageSettings'
import { PresentationNotes } from '@renderer/components/presentation/PresentationNotes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'

export const PresentationComposer = () => {
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const busy = useEditor((state) => state.busy)
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const selected = usePresentation((state) => state.composerIndex)
  const steps = presentationSteps(document)
  const index = Math.min(selected, steps.length - 1)
  const step = steps[index]
  const slide = step ? buildPresentationSlide(document, step) : null
  const playable = steps.some((item) => !item.hidden)
  const change = (patch: Partial<PresentationStep>): void => {
    editPresentationPages((current) =>
      current.map((entry, row) => (row === index ? { ...entry, ...patch } : entry)),
    )
  }
  const move = (offset: 1 | -1): void => {
    const saved = editPresentationPages((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      if (item) next.splice(index + offset, 0, item)
      return next
    })
    if (saved) selectPresentationPage(index + offset)
  }
  if (!slide || !step) return null
  return (
    <section
      data-presentation-composer
      className="flex h-full min-h-0 flex-col bg-muted/40"
      aria-label={translate('presentationComposer')}
    >
      <div className="flex min-h-0 flex-1 max-lg:flex-wrap max-lg:overflow-auto">
        <PresentationPageList
          document={document}
          steps={steps}
          selected={index}
          onSelect={selectPresentationPage}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5 max-lg:flex-[1_0_calc(100%-10rem)] max-sm:flex-[1_0_100%] max-sm:p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{translate('presentation')}</span>
            <span className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
              <Check className="size-3" />
              {translate('presentationFromMap')}
            </span>
            <span className="text-xs text-muted-foreground">
              {translate('presentationPageCount', { count: steps.length })}
            </span>
            {!document.presentation?.length && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  editPresentationPages((current) => current)
                }}
              >
                <Save className="size-3" />
                {translate('presentationSavePages')}
              </Button>
            )}
          </div>
          <div className="sm:hidden">
            <Select
              value={String(index)}
              onValueChange={(value) => {
                selectPresentationPage(Number(value))
              }}
            >
              <SelectTrigger className="w-full" aria-label={translate('presentationPages')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {steps.map((entry, row) => (
                  <SelectItem key={`${entry.topicId}:${row}`} value={String(row)}>
                    {row + 1}. {document.topics[entry.topicId]?.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="m-auto w-full max-w-5xl shrink-0">
            <PresentationSlide
              document={document}
              slide={slide}
              index={index}
              total={steps.length}
            />
          </div>
          <PresentationNotes
            key={`${workbookId}:${sheetId}:${document.id}:${index}:${step.topicId}`}
            notes={step.notes ?? slide.topic.notes ?? ''}
            disabled={busy}
            target={{
              workbookId,
              sheetId,
              documentId: document.id,
              pageIndex: index,
              topicId: step.topicId,
            }}
          />
          <div className="flex justify-center">
            <Button
              variant="outline"
              disabled={busy || (step.hidden ?? false) || !playable}
              onClick={() => {
                showPresentationStep(steps.slice(0, index).filter((item) => !item.hidden).length)
              }}
            >
              <Play className="size-4" />
              {translate('presentationPreviewPage')}
            </Button>
          </div>
          {!playable && (
            <p role="status" className="text-center text-sm text-muted-foreground">
              {translate('presentationAllHidden')}
            </p>
          )}
        </main>
        <PresentationPageSettings
          key={`${workbookId}:${sheetId}:${index}`}
          document={document}
          step={step}
          title={slide.topic.title}
          index={index}
          total={steps.length}
          busy={busy}
          onResetStyle={() => {
            editPresentationPages((current) =>
              current.map((entry, row) => {
                if (row !== index) return entry
                const next = { ...entry }
                delete next.appearance
                return next
              }),
            )
          }}
          onChange={change}
          onMove={move}
        />
      </div>
    </section>
  )
}
