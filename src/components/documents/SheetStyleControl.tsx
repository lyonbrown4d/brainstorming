import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
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
        {(['normal', 'sketch'] as const).map((style) => (
          <ToggleGroupItem
            key={style}
            value={style}
            className="h-16 flex-1 flex-col gap-1.5 py-2 text-xs"
          >
            <TopicShapeVisual
              shape="rounded"
              visualStyle={style}
              seedKey="sheet-style-preview"
              width={58}
              height={24}
              fill="var(--color-muted)"
              stroke="currentColor"
              className="h-6 w-14"
            />
            {translate(style === 'normal' ? 'sheetStyleNormal' : 'sheetStyleSketch')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
