import { useCallback, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { brandMarkerNames } from '@shared/markerIcons'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { BrandMarkerIcon } from '@renderer/components/metadata/BrandMarkerIcon'
import type { MarkerPickerChoices } from '@renderer/components/metadata/MarkerPicker'
const COLUMNS = 6
const ROW_HEIGHT = 40
export const BrandMarkerPicker = ({
  query,
  selected,
  onToggle,
}: MarkerPickerChoices & {
  query: string
}) => {
  const container = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | undefined>(undefined)
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => brandMarkerNames().filter((name) => name.slice(13).includes(query.trim().toLowerCase())),
    [query],
  )
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) =>
      [...new Set([...defaultRangeExtractor(range), Math.floor(active / COLUMNS)])].sort(
        (a, b) => a - b,
      ),
    [active],
  )
  // TanStack Virtual owns mutable viewport measurements; this component must not be auto-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: Math.ceil(matches.length / COLUMNS),
    getScrollElement: () =>
      container.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ??
      null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
    rangeExtractor,
  })
  return (
    <>
      <p className="text-xs text-muted-foreground" role="status">
        {matches.length} 个匹配图标
      </p>
      <ScrollArea ref={container} className="h-48">
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
          role="group"
          aria-label="品牌图标"
        >
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              className="absolute top-0 left-0 grid w-full grid-cols-6 gap-1"
              style={{ transform: `translateY(${row.start}px)`, height: ROW_HEIGHT }}
            >
              {matches
                .slice(row.index * COLUMNS, (row.index + 1) * COLUMNS)
                .map((marker, column) => {
                  const index = row.index * COLUMNS + column
                  return (
                    <Button
                      key={marker}
                      ref={(element) => {
                        if (element && pendingFocus.current === marker) {
                          pendingFocus.current = undefined
                          element.focus({ preventScroll: true })
                        }
                      }}
                      variant="ghost"
                      size="icon"
                      title={marker.slice(13)}
                      aria-label={`品牌图标 ${marker.slice(13)}`}
                      aria-pressed={selected.includes(marker)}
                      tabIndex={index === active ? 0 : -1}
                      className="w-full aria-pressed:bg-accent aria-disabled:opacity-50"
                      aria-disabled={selected.length >= 32 && !selected.includes(marker)}
                      onFocus={() => {
                        setActive(index)
                      }}
                      onKeyDown={(event) => {
                        const next = {
                          ArrowLeft: index - 1,
                          ArrowRight: index + 1,
                          ArrowUp: index - COLUMNS,
                          ArrowDown: index + COLUMNS,
                          Home: 0,
                          End: matches.length - 1,
                        }[event.key]
                        if (next === undefined) return
                        event.preventDefault()
                        event.stopPropagation()
                        const target = Math.max(0, Math.min(matches.length - 1, next))
                        pendingFocus.current = matches[target]
                        virtualizer.scrollToIndex(Math.floor(target / COLUMNS), { align: 'auto' })
                        setActive(target)
                      }}
                      onClick={() => {
                        if (selected.length < 32 || selected.includes(marker)) onToggle(marker)
                      }}
                    >
                      <BrandMarkerIcon marker={marker} />
                    </Button>
                  )
                })}
            </div>
          ))}
        </div>
        {!matches.length && <p className="py-4 text-xs text-muted-foreground">没有匹配的图标。</p>}
      </ScrollArea>
    </>
  )
}
