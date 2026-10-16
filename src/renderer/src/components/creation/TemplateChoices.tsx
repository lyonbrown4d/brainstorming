import { File, LayoutTemplate } from 'lucide-react'
import { Button } from '../ui/button'
import { templateOptions } from '../documents/templates'
import type { CreationRequest } from './types'

export function TemplateChoices({
  value,
  onChange,
  disabled,
}: {
  value: CreationRequest['template']
  onChange: (template: CreationRequest['template']) => void
  disabled: boolean
}) {
  const choices = [{ id: 'blank' as const, title: '空白导图', count: 1 }, ...templateOptions]
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
      role="group"
      aria-label="选择初始内容"
    >
      {choices.map((template) => (
        <Button
          key={template.id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`选择${template.title}模板`}
          aria-pressed={value === template.id}
          onClick={() => {
            onChange(template.id)
          }}
          className="h-auto min-w-0 flex-col gap-2 rounded-xl px-2 py-4 aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
        >
          {template.id === 'blank' ? (
            <File className="size-5" />
          ) : (
            <LayoutTemplate className="size-5" />
          )}
          <span className="text-sm">{template.title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {template.id === 'blank' ? '从一个中心主题开始' : `${template.count} 个可编辑主题`}
          </span>
        </Button>
      ))}
    </div>
  )
}
