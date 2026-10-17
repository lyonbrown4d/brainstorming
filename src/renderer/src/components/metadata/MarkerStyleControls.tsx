import type { TopicMetadata } from '@core'
import { FieldSelect } from '@renderer/components/FieldSelect'
export const MarkerStyleControls = ({
  style,
  onChange,
}: {
  style: TopicMetadata['markerStyle']
  onChange: (style: NonNullable<TopicMetadata['markerStyle']>) => void
}) => {
  return (
    <div className="grid grid-cols-2 gap-2" aria-label="图标显示设置">
      <div className="space-y-1 text-xs text-muted-foreground">
        <span>位置</span>
        <FieldSelect
          label="图标位置"
          value={style?.position ?? 'bottom'}
          className="w-full"
          options={[
            { value: 'left', label: '文字左侧' },
            { value: 'right', label: '文字右侧' },
            { value: 'top', label: '文字上方' },
            { value: 'bottom', label: '文字下方' },
          ]}
          onChange={(position) => {
            onChange({ ...style, position })
          }}
        />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <span>尺寸</span>
        <FieldSelect
          label="图标尺寸"
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
