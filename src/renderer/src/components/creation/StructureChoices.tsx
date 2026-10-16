import type { LayoutKind } from '@core'
import { Check } from 'lucide-react'
import { Button } from '../ui/button'
import { StructurePreview } from '../documents/StructurePreview'
import { structureOptions } from '../documents/structureOptions'

const families: readonly { title: string; kinds: readonly LayoutKind[] }[] = [
  { title: '思维导图', kinds: ['map'] },
  { title: '逻辑图', kinds: ['logic-right', 'logic-left'] },
  { title: '组织图', kinds: ['org-down', 'org-up'] },
  { title: '树形图', kinds: ['tree-down', 'tree-up'] },
  { title: '括号图', kinds: ['brace-right', 'brace-left'] },
  { title: '鱼骨图', kinds: ['fishbone'] },
  { title: '时间线', kinds: ['timeline', 'timeline-vertical'] },
  { title: '矩阵', kinds: ['matrix'] },
  { title: '树形表格', kinds: ['tree-table-right', 'tree-table-down'] },
]

export function StructureChoices({
  value,
  onChange,
  disabled,
}: {
  value: LayoutKind
  onChange: (layout: LayoutKind) => void
  disabled: boolean
}) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      role="group"
      aria-label="选择图形结构"
    >
      {families.map((family) => (
        <section
          key={family.title}
          aria-label={family.title}
          className="rounded-2xl border border-border bg-background p-3 shadow-xs"
        >
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{family.title}</h3>
          <div className={family.kinds.length > 1 ? 'grid grid-cols-2 gap-2' : 'grid'}>
            {family.kinds.map((kind) => {
              const label = structureOptions.find((option) => option.value === kind)?.label ?? kind
              return (
                <Button
                  key={kind}
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`选择${label}`}
                  aria-pressed={value === kind}
                  onClick={() => {
                    onChange(kind)
                  }}
                  className="relative h-auto min-w-0 flex-col gap-2 rounded-xl border border-transparent px-2 py-3 text-xs aria-pressed:border-primary/50 aria-pressed:bg-primary/5 aria-pressed:text-primary [&_svg]:h-14 [&_svg]:w-full"
                >
                  <StructurePreview kind={kind} />
                  <span>{label}</span>
                  {value === kind && (
                    <Check className="absolute top-1 right-1 !size-3" aria-hidden="true" />
                  )}
                </Button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
