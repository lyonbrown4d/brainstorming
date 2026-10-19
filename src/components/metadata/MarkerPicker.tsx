import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useMessages } from '@renderer/i18n/useMessages'

import { lazy, Suspense, useState } from 'react'
import { X } from 'lucide-react'
import { loadBrandMarkers } from '@shared/markerIcons'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { MarkerIcon } from '@renderer/components/metadata/MarkerIcon'
import { getMarkerOptions } from '@renderer/components/metadata/markers'
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
  const { translate } = useMessages()
  const markerOptions = getMarkerOptions(translate)

  const [collection, setCollection] = useState<'common' | 'brands'>('common')
  const [query, setQuery] = useState('')
  const common = markerOptions.filter((option) =>
    `${option.title} ${option.value}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="space-y-3" role="group" aria-label={translate('iconPicker')}>
      <MarkerStyleControls style={style} onChange={onStyleChange} />
      <div className="flex gap-2">
        <FieldSelect
          label={translate('iconLibrary')}
          value={collection}
          onChange={setCollection}
          className="w-32 shrink-0"
          options={[
            { value: 'common', label: translate('commonIcons') },
            { value: 'brands', label: translate('brandIcons') },
          ]}
        />
        <Input
          aria-label={translate('searchIcons')}
          placeholder={translate('searchIcons')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label={translate('selectedIcons')}>
          {selected.map((marker) => (
            <Button
              key={marker}
              variant="secondary"
              size="sm"
              className="gap-1 px-2"
              aria-label={translate('removeIconValue0', { value0: marker })}
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
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={translate('commonIcons')}
            data-marker-options
          >
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
              <p className="col-span-full py-4 text-xs text-muted-foreground">
                {translate('noMatchingIcons')}
              </p>
            )}
          </div>
        </ScrollArea>
      ) : (
        <Suspense
          fallback={
            <LoadingState className="py-4" label={translate('loadingOfflineIconLibrary')} />
          }
        >
          <Brands key={query} query={query} selected={selected} onToggle={onToggle} />
        </Suspense>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.length}
        {translate('32IconsBrandIconsFromSimpleIcons')}
      </p>
    </div>
  )
}
