import { lazy, Suspense, useState } from 'react'
import { X } from 'lucide-react'
import { loadBrandMarkers } from '@shared/markerIcons'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { MarkerIcon } from '@renderer/components/metadata/MarkerIcon'
import { markerOptions } from '@renderer/components/metadata/markers'
import { MarkerStyleControls } from '@renderer/components/metadata/MarkerStyleControls'
import type { TopicMetadata } from '@core'
const Brands = lazy(async () => {
  await loadBrandMarkers()
  const module = await import('@renderer/components/metadata/BrandMarkerPicker')
  return { default: module.BrandMarkerPicker }
})
export interface MarkerPickerChoices {
  readonly selected: readonly string[]
  readonly onToggle: (marker: string) => void
}
export const MarkerPicker = ({
  selected,
  onToggle,
  style,
  onStyleChange,
}: MarkerPickerChoices & {
  style?: TopicMetadata['markerStyle']
  onStyleChange: (style: NonNullable<TopicMetadata['markerStyle']>) => void
}) => {
  const [collection, setCollection] = useState<'common' | 'brands'>('common')
  const [query, setQuery] = useState('')
  const common = markerOptions.filter((option) =>
    `${option.title} ${option.value}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="space-y-3" role="group" aria-label="图标选择器">
      <MarkerStyleControls style={style} onChange={onStyleChange} />
      <div className="flex gap-2">
        <FieldSelect
          label="图标库"
          value={collection}
          onChange={setCollection}
          className="w-32 shrink-0"
          options={[
            { value: 'common', label: '常用图标' },
            { value: 'brands', label: '品牌图标' },
          ]}
        />
        <Input
          aria-label="搜索图标"
          placeholder="搜索图标"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="已选图标">
          {selected.map((marker) => (
            <Button
              key={marker}
              variant="secondary"
              size="sm"
              className="gap-1 px-2"
              aria-label={`移除图标 ${marker}`}
              title={marker}
              onClick={() => {
                onToggle(marker)
              }}
            >
              <MarkerIcon marker={marker} />
              <X className="size-3" />
            </Button>
          ))}
        </div>
      )}
      {collection === 'common' ? (
        <ScrollArea className="h-48">
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="常用图标">
            {common.map(({ value, title, Icon }) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                aria-label={title}
                aria-pressed={selected.includes(value)}
                className="justify-start gap-1 aria-pressed:bg-accent"
                disabled={selected.length >= 32 && !selected.includes(value)}
                onClick={() => {
                  onToggle(value)
                }}
              >
                <Icon className="size-4" />
                {title}
              </Button>
            ))}
            {!common.length && (
              <p className="col-span-3 py-4 text-xs text-muted-foreground">没有匹配的图标。</p>
            )}
          </div>
        </ScrollArea>
      ) : (
        <Suspense
          fallback={
            <p role="status" className="py-4 text-xs">
              正在载入离线图标库…
            </p>
          }
        >
          <Brands key={query} query={query} selected={selected} onToggle={onToggle} />
        </Suspense>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.length}/32 个图标 · 品牌图标来自 Simple Icons
      </p>
    </div>
  )
}
