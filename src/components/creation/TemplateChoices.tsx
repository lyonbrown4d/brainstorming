import { useMessages } from '@renderer/i18n/useMessages'

import { Check, FolderKanban, Lightbulb, Minus, ScanLine, BookOpen } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { templateOptions } from '@renderer/components/documents/templates'
import type { CreationRequest } from '@renderer/components/creation/types'

const iconColors = {
  blank: 'bg-secondary text-muted-foreground',
  brainstorm: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  project: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  swot: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  study: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
} as const

export const TemplateChoices = ({
  value,
  onChange,
  disabled,
}: {
  value: CreationRequest['template']
  onChange: (template: CreationRequest['template']) => void
  disabled: boolean
}) => {
  const { translate, translateLabel } = useMessages()

  const choices = [{ id: 'blank' as const, title: translate('noTemplate') }, ...templateOptions]
  return (
    <div
      className="grid gap-2 sm:grid-cols-2"
      role="group"
      aria-label={translate('chooseInitialContent')}
    >
      {choices.map((template) => {
        const Icon = {
          blank: Minus,
          brainstorm: Lightbulb,
          project: FolderKanban,
          swot: ScanLine,
          study: BookOpen,
        }[template.id]
        return (
          <Button
            key={template.id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={
              template.id === 'blank'
                ? template.title
                : translate('chooseValue0Template', { value0: translateLabel(template.title) })
            }
            aria-pressed={value === template.id}
            onClick={() => {
              onChange(template.id)
            }}
            className="h-11 min-w-0 justify-start rounded-lg border-border px-3 text-xs shadow-none transition-[border-color,background-color] aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconColors[template.id]}`}
            >
              <Icon aria-hidden="true" className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-left leading-snug whitespace-normal">
              {translateLabel(template.title)}
            </span>
            {value === template.id && <Check aria-hidden="true" data-icon="inline-end" />}
          </Button>
        )
      })}
    </div>
  )
}
