import { PenLine, Shapes } from 'lucide-react'
import type { SheetVisualStyle } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'

export const SheetStyleControl = ({
  value,
  disabled,
  onChange,
}: {
  value: SheetVisualStyle
  disabled: boolean
  onChange: (style: SheetVisualStyle) => void
}) => {
  const { translate } = useMessages()
  return (
    <div className="mb-4 grid gap-2 border-b border-border pb-4">
      <span className="text-xs font-medium text-secondary-foreground">
        {translate('sheetVisualStyle')}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        className="w-full"
        value={value}
        disabled={disabled}
        aria-label={translate('sheetVisualStyle')}
        onValueChange={(next) => {
          if (next === 'normal' || next === 'sketch') onChange(next)
        }}
      >
        <ToggleGroupItem value="normal" className="flex-1 gap-2 text-xs">
          <Shapes className="size-3.5" />
          {translate('sheetStyleNormal')}
        </ToggleGroupItem>
        <ToggleGroupItem value="sketch" className="flex-1 gap-2 text-xs">
          <PenLine className="size-3.5" />
          {translate('sheetStyleSketch')}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
