import { useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'
import type { LayoutKind } from '@core'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { StructurePreview } from '@renderer/components/documents/StructurePreview'
import { structureOptions } from '@renderer/components/documents/structureOptions'
import { templateOptions } from '@renderer/components/documents/templates'
import { StructureChoices } from '@renderer/components/creation/StructureChoices'
import { TemplateChoices } from '@renderer/components/creation/TemplateChoices'
import { CreationHeader } from '@renderer/components/creation/CreationHeader'
import { isCompositionKey } from '@renderer/state/keyboard'
import { useCreationStepFocus } from '@renderer/hooks/useCreationStepFocus'
import { cn } from '@renderer/lib/utils'
import type { CreationGalleryProps, CreationRequest } from '@renderer/components/creation/types'
export type { CreationGalleryProps, CreationRequest } from '@renderer/components/creation/types'

export const CreationGallery = ({
  mode,
  onCreate,
  onCancel,
  cancelLabel = '返回画布',
  onOpen,
  onExample,
  busy = false,
  error,
  step: controlledStep,
  onStepChange,
  sidebar,
  showHeader = true,
}: CreationGalleryProps) => {
  const nameId = useId()
  const [localStep, setLocalStep] = useState<1 | 2>(1)
  const step = controlledStep ?? localStep
  const [title, setTitle] = useState('')
  const [layout, setLayout] = useState<LayoutKind>('map')
  const [template, setTemplate] = useState<CreationRequest['template']>('blank')
  const [accepted, setAccepted] = useState(false)
  const submitting = useRef(false)
  const { headingRef, scrollRef } = useCreationStepFocus(step)
  const noun = mode === 'document' ? '文档' : '画布'
  const disabled = busy || accepted
  const selectedLabel = structureOptions.find((option) => option.value === layout)?.label ?? layout
  const resolvedTitle =
    template === 'blank'
      ? mode === 'document'
        ? '新的想法'
        : '新画布'
      : (templateOptions.find((option) => option.id === template)?.title ?? '新的想法')
  const changeStep = (next: 1 | 2) => {
    if (disabled) return
    setLocalStep(next)
    onStepChange?.(next)
  }
  return (
    <section
      aria-label={`新建${noun}`}
      className="flex h-full min-h-0 flex-1 flex-col bg-secondary/25 text-foreground"
    >
      {showHeader && (
        <CreationHeader
          step={step}
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
          if (step !== 2 || disabled || submitting.current) return
          submitting.current = true
          try {
            if (onCreate({ title, layout, template })) setAccepted(true)
          } finally {
            submitting.current = false
          }
        }}
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto grid w-full max-w-[1600px] gap-8 px-5 py-8 sm:px-12',
              sidebar && 'lg:grid-cols-[minmax(0,1fr)_22rem]',
            )}
          >
            <div className="min-w-0">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mb-5 text-[28px] leading-9 font-semibold tracking-tight outline-none"
              >
                新建{noun}
              </h1>
              {step === 1 ? (
                <StructureChoices value={layout} onChange={setLayout} disabled={disabled} />
              ) : (
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
                  <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-3">
                      <Label htmlFor={nameId}>{noun}名称</Label>
                      <Input
                        id={nameId}
                        value={title}
                        maxLength={80}
                        disabled={disabled}
                        placeholder={resolvedTitle}
                        className="h-11 bg-background"
                        autoComplete="off"
                        onChange={(event) => {
                          setTitle(event.target.value)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && isCompositionKey(event.nativeEvent))
                            event.preventDefault()
                        }}
                      />
                    </div>
                    <section aria-label="内容模板" className="flex flex-col gap-3">
                      <h2 className="text-sm font-medium">内容模板</h2>
                      <TemplateChoices
                        value={template}
                        onChange={setTemplate}
                        disabled={disabled}
                      />
                    </section>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-5 rounded-lg bg-primary/5 p-6 text-sm text-primary [&_svg]:h-28">
                    <StructurePreview kind={layout} />
                    <span>{selectedLabel}</span>
                  </div>
                </div>
              )}
              {error && (
                <p className="mt-5 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            {sidebar}
            {!sidebar && onExample && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                className="w-fit"
                onClick={onExample}
              >
                <BookOpen data-icon="inline-start" />
                探索示例
              </Button>
            )}
          </div>
        </div>
        <footer className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-t border-border bg-background px-5 py-3 sm:px-12">
          <div className="flex min-w-0 items-center gap-4">
            <div className="hidden h-12 w-24 shrink-0 rounded-md bg-primary/5 px-3 py-1 sm:block [&_svg]:h-full">
              <StructurePreview kind={layout} />
            </div>
            <span className="truncate text-sm font-medium">{selectedLabel}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {step === 2 && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  changeStep(1)
                }}
              >
                <ArrowLeft data-icon="inline-start" />
                上一步
              </Button>
            )}
            {step === 1 ? (
              <Button
                key="next"
                type="button"
                disabled={disabled}
                className="h-11 min-w-32 sm:min-w-56"
                onClick={() => {
                  changeStep(2)
                }}
              >
                下一步
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button
                key="create"
                type="submit"
                disabled={disabled}
                className="h-11 min-w-32 sm:min-w-56"
              >
                {busy ? '正在创建…' : `创建${noun}`}
                <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </footer>
      </form>
    </section>
  )
}
