import { useMessages } from '@renderer/i18n/useMessages'

import type { TopicMetadata } from '@core'
import { FieldSelect } from '@renderer/components/FieldSelect'
export const MarkerStyleControls = ({
  style,
  onChange,
}: {
  style: TopicMetadata['markerStyle']
  onChange: (style: NonNullable<TopicMetadata['markerStyle']>) => void
}) => {
  const { translate } = useMessages()

  return (
    <div className="grid grid-cols-2 gap-2" aria-label={translate('iconDisplaySettings')}>
      <div className="space-y-1 text-xs text-muted-foreground">
        <span>{translate('position')}</span>
        <FieldSelect
          label={translate('iconPosition')}
          value={style?.position ?? 'bottom'}
          className="w-full"
          options={[
            { value: 'left', label: translate('leftOfText') },
            { value: 'right', label: translate('rightOfText') },
            { value: 'top', label: translate('aboveText') },
            { value: 'bottom', label: translate('belowText') },
          ]}
          onChange={(position) => {
            onChange({ ...style, position })
          }}
        />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <span>{translate('size')}</span>
        <FieldSelect
          label={translate('iconSize')}
          value={String(style?.size ?? 16)}
          className="w-full"
          options={[...new Set([12, 16, 20, 24, 32, 40, 48, style?.size ?? 16])]
            .sort((a, b) => a - b)
            .map((size) => ({ value: String(size), label: `${size} px` }))}
          onChange={(size) => {
            onChange({ ...style, size: Number(size) })
          }}
        />
      </div>
    </div>
  )
}
