import { Check, LayoutTemplate, Minus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { templateOptions } from '@renderer/components/documents/templates'
import type { CreationRequest } from '@renderer/components/creation/types'

export const TemplateChoices = ({
  value,
  onChange,
  disabled,
}: {
  value: CreationRequest['template']
  onChange: (template: CreationRequest['template']) => void
  disabled: boolean
}) => {
  const choices = [{ id: 'blank' as const, title: '不使用模板' }, ...templateOptions]
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="选择初始内容">
      {choices.map((template) => {
        const Icon = template.id === 'blank' ? Minus : LayoutTemplate
        return (
          <Button
            key={template.id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={template.id === 'blank' ? template.title : `选择${template.title}模板`}
            aria-pressed={value === template.id}
            onClick={() => {
              onChange(template.id)
            }}
            className="h-14 justify-start rounded-lg border-border px-4 shadow-none aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
          >
            <Icon data-icon="inline-start" />
            <span className="flex-1 text-left">{template.title}</span>
            {value === template.id && <Check data-icon="inline-end" />}
          </Button>
        )
      })}
    </div>
  )
}
