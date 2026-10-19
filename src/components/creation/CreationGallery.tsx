import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { motion, useReducedMotion } from 'motion/react'
import { useMessages } from '@renderer/i18n/useMessages'

import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, FilePlus2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { CreationSetup } from '@renderer/components/creation/CreationSetup'
import { CreationStructurePreview } from '@renderer/components/creation/CreationStructurePreview'
import { getStructureOptions } from '@renderer/components/documents/structureOptions'
import { useTemplates } from '@renderer/hooks/useTemplates'
import { templateText } from '@shared/templates'
import { useTranslation } from 'react-i18next'
import { StructureChoices } from '@renderer/components/creation/StructureChoices'
import { CreationSteps } from '@renderer/components/creation/CreationSteps'
import { structureAppearance } from '@renderer/components/creation/structureAppearance'
import { CreationHeader } from '@renderer/components/creation/CreationHeader'
import { useCreationStepFocus } from '@renderer/hooks/useCreationStepFocus'
import { cn } from '@renderer/lib/utils'
import type { CreationGalleryProps, CreationRequest } from '@renderer/components/creation/types'
export type { CreationGalleryProps, CreationRequest } from '@renderer/components/creation/types'

export const CreationGallery = ({
  mode,
  onCreate,
  onCancel,
  cancelLabel: suppliedCancelLabel,
  onOpen,
  onExample,
  busy = false,
  error,
  draft: controlledDraft,
  onDraftChange,
  step: controlledStep,
  onStepChange,
  sidebar,
  showHeader = true,
}: CreationGalleryProps) => {
  const { translate } = useMessages()
  const { i18n } = useTranslation()
  const catalog = useTemplates()
  const language = i18n.resolvedLanguage ?? i18n.language
  const reducedMotion = useReducedMotion()
  const structureOptions = getStructureOptions(translate)
  const cancelLabel = suppliedCancelLabel ?? translate('returnToCanvas')

  const [localStep, setLocalStep] = useState<1 | 2>(1)
  const step = controlledStep ?? localStep
  const [localDraft, setLocalDraft] = useState<CreationRequest>({
    title: '',
    layout: 'map',
    template: 'blank',
  })
  const draft = controlledDraft ?? localDraft
  const { title, layout, template } = draft
  const updateDraft = (patch: Partial<CreationRequest>): void => {
    const next = { ...draft, ...patch }
    setLocalDraft(next)
    onDraftChange?.(next)
  }
  const [accepted, setAccepted] = useState(false)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const { headingRef, scrollRef } = useCreationStepFocus(step)
  const noun = mode === 'document' ? translate('document') : translate('sheet')
  const disabled = busy || pending || accepted
  const selectedLabel =
    layout === 'none'
      ? translate('presetNone')
      : (structureOptions.find((option) => option.value === layout)?.label ?? layout)
  const resolvedTitle =
    layout === 'none' || template === 'blank'
      ? mode === 'document'
        ? translate('newIdea')
        : translate('newSheetLabel402')
      : (() => {
          const option = catalog.data?.templates.find((option) => option.id === template)
          return option ? templateText(option.title, language) : translate('newIdea')
        })()
  const submit = async (): Promise<void> => {
    if (step !== 2 || disabled || submitting.current) return
    submitting.current = true
    setPending(true)
    setSubmissionError(null)
    try {
      if (await onCreate({ title, layout, template: layout === 'none' ? 'blank' : template }))
        setAccepted(true)
      else setSubmissionError(translate('creationFailedPleaseRetry'))
    } catch {
      setSubmissionError(translate('creationFailedPleaseRetry'))
    } finally {
      setPending(false)
      submitting.current = false
    }
  }
  const changeStep = (next: 1 | 2) => {
    if (disabled) return
    setLocalStep(next)
    onStepChange?.(next)
  }
  return (
    <section
      aria-label={translate('newValue0', { value0: noun })}
      aria-busy={busy || pending}
      className="flex h-full min-h-0 flex-1 flex-col bg-canvas text-foreground"
    >
      {showHeader && (
        <CreationHeader
          busy={disabled}
          cancelLabel={cancelLabel}
          {...(onCancel ? { onCancel } : {})}
          {...(onOpen ? { onOpen } : {})}
        />
      )}
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            className={cn(
              'mx-auto grid w-full max-w-6xl items-start gap-6 px-4 py-5 sm:px-6',
              sidebar && 'lg:grid-cols-[minmax(0,1fr)_13rem]',
            )}
          >
            <motion.div
              key={step}
              initial={reducedMotion ? false : { opacity: 0, x: step === 2 ? 12 : -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, ease: 'easeOut' }}
              className="min-w-0"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="flex items-center gap-2.5 text-xl leading-7 font-semibold tracking-tight outline-none"
                >
                  <FilePlus2
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  {translate('newValue0', { value0: noun })}
                </h1>
                <CreationSteps step={step} />
              </div>
              {step === 1 ? (
                <StructureChoices
                  value={layout}
                  onChange={(layout) => {
                    updateDraft({ layout })
                  }}
                  disabled={disabled}
                />
              ) : (
                <CreationSetup
                  draft={draft}
                  disabled={disabled}
                  noun={noun}
                  placeholder={resolvedTitle}
                  label={selectedLabel}
                  onChange={updateDraft}
                />
              )}
              {(error ?? submissionError) && (
                <p className="mt-5 text-sm text-destructive" role="alert">
                  {error ?? submissionError}
                </p>
              )}
            </motion.div>
            {sidebar}
            {!sidebar && onExample && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="w-fit"
                onClick={onExample}
              >
                <BookOpen aria-hidden="true" data-icon="inline-start" />
                {translate('exploreExample')}
              </Button>
            )}
          </div>
        </div>
        <footer className="shrink-0 border-t border-border bg-background">
          <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                style={structureAppearance(layout === 'none' ? 'map' : layout)}
                className="hidden h-8 w-14 shrink-0 rounded-md bg-secondary/60 px-1 py-0.5 sm:block [&_svg]:h-full"
              >
                <CreationStructurePreview layout={layout} />
              </div>
              <span className="truncate text-xs font-medium">{selectedLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {step === 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    changeStep(1)
                  }}
                >
                  <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                  {translate('backLabel451')}
                </Button>
              )}
              {step === 1 ? (
                <Button
                  key="next"
                  type="button"
                  disabled={disabled}
                  size="sm"
                  className="min-w-28 motion-reduce:transition-none"
                  onClick={() => {
                    changeStep(2)
                  }}
                >
                  {translate('next')}
                  <ArrowRight aria-hidden="true" data-icon="inline-end" />
                </Button>
              ) : (
                <Button
                  key="create"
                  type="submit"
                  disabled={disabled}
                  size="sm"
                  className="min-w-28 motion-reduce:transition-none"
                >
                  {busy || pending
                    ? translate('creating')
                    : translate('createValue0', { value0: noun })}
                  {busy || pending ? (
                    <LoadingIndicator placement="end" />
                  ) : (
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </footer>
      </form>
    </section>
  )
}
