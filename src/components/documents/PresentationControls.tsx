import { useMessages } from '@renderer/i18n/useMessages'

import type { PresentationStep } from '@core'
import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'
import { presentationSteps, usePresentation } from '@renderer/state/presentation'
import { useSpatialView } from '@renderer/state/spatial'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'

export { PresentationPlayback } from '@renderer/components/documents/PresentationPlayback'

const emptySteps: readonly PresentationStep[] = []

export const PresentationControls = () => {
  const { translate } = useMessages()

  const [open, setOpen] = useState(false)
  const busy = useEditor((state) => state.busy)
  const document = useEditor((state) => state.history.document)
  const steps = document.presentation ?? emptySteps
  const add = (): void => {
    const state = useEditor.getState(),
      view = useSpatialView.getState().sheets[state.activeSheetId]
    runAnnotationCommand({
      type: 'setPresentation',
      steps: [
        ...steps,
        ...selectedTopicIds(state).map((topicId) => ({
          topicId,
          ...(view?.mode === '3d' && view.camera ? { camera: view.camera } : {}),
        })),
      ],
    })
  }
  const move = (index: number, offset: number): void => {
    const next = [...steps],
      [step] = next.splice(index, 1)
    if (step) {
      next.splice(index + offset, 0, step)
      runAnnotationCommand({ type: 'setPresentation', steps: next })
    }
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={translate('presentationSettings')}
            title={translate('presentationSettings')}
            disabled={busy}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={12}
          onCloseAutoFocus={(event) => {
            if (usePresentation.getState().playing) {
              event.preventDefault()
              requestAnimationFrame(() => {
                window.document.getElementById('sheet-panel')?.focus()
              })
            }
          }}
          className="z-50 max-h-[70vh] w-80 space-y-3 overflow-auto rounded-xl border bg-popover p-3 shadow-lg"
          aria-label={translate('presentationSteps')}
        >
          <p className="text-sm font-medium">{translate('presentationSteps')}</p>
          <p className="text-xs text-muted-foreground">
            {translate('addSelectedTopics3dViewAlsoRecords')}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={add} disabled={busy}>
              <Plus className="size-3" />
              {translate('addSelectedTopicAsStep')}
            </Button>
          </div>
          <ol className="space-y-1">
            {steps.map((step, index) => (
              <li
                key={`${step.topicId}:${index}`}
                className="flex items-center gap-1 rounded border p-1"
              >
                <span className="min-w-0 flex-1 truncate text-xs">
                  {index + 1}. {document.topics[step.topicId]?.title}
                  {step.camera ? ' · 3D' : ''}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={busy || index === 0}
                  aria-label={translate('moveStepValue0Up', { value0: index + 1 })}
                  onClick={() => {
                    move(index, -1)
                  }}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={busy || index === steps.length - 1}
                  aria-label={translate('moveStepValue0Down', { value0: index + 1 })}
                  onClick={() => {
                    move(index, 1)
                  }}
                >
                  <ArrowDown className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={translate('removeStepValue0', { value0: index + 1 })}
                  disabled={busy}
                  onClick={() => {
                    runAnnotationCommand({
                      type: 'setPresentation',
                      steps: steps.filter((_, item) => item !== index),
                    })
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ol>
          {!steps.length && (
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                {translate('automaticPresentation')}
                {presentationSteps(document).length}
                {translate('visibleTopicsTheDocumentStaysUnchanged')}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  runAnnotationCommand({
                    type: 'setPresentation',
                    steps: presentationSteps(document),
                  })
                }}
              >
                {translate('generateAndSaveSteps')}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  )
}
