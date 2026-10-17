import type { LayoutKind } from '@core'
import { Circle, CircleCheck } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { StructurePreview } from '@renderer/components/documents/StructurePreview'
import { structureOptions } from '@renderer/components/documents/structureOptions'

export const StructureChoices = ({
  value,
  onChange,
  disabled,
}: {
  value: LayoutKind
  onChange: (layout: LayoutKind) => void
  disabled: boolean
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" role="group" aria-label="选择图形结构">
      {structureOptions.map(({ value: kind, label }) => {
        const SelectedIcon = value === kind ? CircleCheck : Circle
        return (
          <Button
            key={kind}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={`选择${label}`}
            aria-pressed={value === kind}
            onClick={() => {
              onChange(kind)
            }}
            className="relative h-[clamp(6rem,calc((100dvh-20rem)/5),8.5rem)] min-w-0 flex-col gap-2 rounded-lg border-border px-3 py-3 text-sm shadow-none aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary [&_svg]:h-[clamp(2.5rem,calc((100dvh-33rem)/5),4.25rem)] [&_svg]:w-full"
          >
            <SelectedIcon className="absolute top-3 left-3 !size-4 text-primary/65" />
            <StructurePreview kind={kind} />
            <span>{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
