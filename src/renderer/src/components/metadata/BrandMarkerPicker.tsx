import { useState } from 'react'
import { brandMarkerNames } from '@shared/markerIcons'
import { Button } from '../ui/button'
import { BrandMarkerIcon } from './BrandMarkerIcon'
import type { MarkerPickerChoices } from './MarkerPicker'

export function BrandMarkerPicker({
  query,
  selected,
  onToggle,
}: MarkerPickerChoices & { query: string }) {
  const [limit, setLimit] = useState(80)
  const matches = brandMarkerNames().filter((name) =>
    name.slice(13).includes(query.trim().toLowerCase()),
  )
  return (
    <>
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="品牌图标">
        {matches.slice(0, limit).map((marker) => (
          <Button
            key={marker}
            variant="ghost"
            size="icon"
            title={marker.slice(13)}
            aria-label={`品牌图标 ${marker.slice(13)}`}
            aria-pressed={selected.includes(marker)}
            className="aria-pressed:bg-accent"
            disabled={selected.length >= 32 && !selected.includes(marker)}
            onClick={() => {
              onToggle(marker)
            }}
          >
            <BrandMarkerIcon marker={marker} />
          </Button>
        ))}
      </div>
      {!matches.length && <p className="py-4 text-xs text-muted-foreground">没有匹配的图标。</p>}
      {matches.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            setLimit((value) => value + 80)
          }}
        >
          显示更多（{matches.length - limit}）
        </Button>
      )}
    </>
  )
}
