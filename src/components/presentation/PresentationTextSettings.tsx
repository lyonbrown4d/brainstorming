import type { PresentationTextStyle } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { PresentationColorField } from '@renderer/components/presentation/PresentationColorField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { Checkbox } from '@renderer/components/ui/checkbox'

export const PresentationTextSettings = ({
  value,
  defaultColor,
  disabled,
  onChange,
}: {
  value: PresentationTextStyle
  defaultColor: string
  disabled: boolean
  onChange: (style: PresentationTextStyle) => void
}) => {
  const { translate } = useMessages()
  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 text-xs">
        <span>{translate('presentationTextSize')}</span>
        <Select
          value={String(value.scale ?? 1)}
          disabled={disabled}
          onValueChange={(scale) => {
            onChange({ ...value, scale: Number(scale) })
          }}
        >
          <SelectTrigger className="h-8 w-24" aria-label={translate('presentationTextSize')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((scale) => (
              <SelectItem key={scale} value={String(scale)}>
                {Math.round(scale * 100)}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <PresentationColorField
        key={value.color ?? defaultColor}
        label={translate('presentationTextColor')}
        value={value.color ?? defaultColor}
        disabled={disabled}
        onChange={(color) => {
          onChange({ ...value, color })
        }}
      />
      <label className="flex items-center justify-between gap-3 text-xs">
        <span>{translate('presentationTextAlign')}</span>
        <Select
          value={value.align ?? 'left'}
          disabled={disabled}
          onValueChange={(align) => {
            if (align === 'left' || align === 'center' || align === 'right')
              onChange({ ...value, align })
          }}
        >
          <SelectTrigger className="h-8 w-24" aria-label={translate('presentationTextAlign')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['left', 'center', 'right'] as const).map((align) => (
              <SelectItem key={align} value={align}>
                {translate(
                  align === 'left'
                    ? 'presentationAlignLeft'
                    : align === 'center'
                      ? 'presentationAlignCenter'
                      : 'presentationAlignRight',
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={value.bold ?? true}
          disabled={disabled}
          onCheckedChange={(bold) => {
            onChange({ ...value, bold: bold === true })
          }}
        />
        {translate('presentationTextBold')}
      </label>
    </div>
  )
}
