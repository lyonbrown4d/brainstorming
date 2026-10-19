import { useState, type ReactNode } from 'react'
import type { LayoutKind } from '@core'
import { Check, Search, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { StructurePreview } from '@renderer/components/documents/StructurePreview'
import {
  filterStructureGroups,
  isStructureGroup,
  structureGroupFor,
  structureGroups,
  type StructureGroup,
} from '@renderer/components/documents/structureCatalog'
import { structureAppearance } from '@renderer/components/creation/structureAppearance'
import { useMessages } from '@renderer/i18n/useMessages'
import { isCompositionKey } from '@renderer/state/keyboard'
import { cn } from '@renderer/lib/utils'

export const StructureBrowser = ({
  value,
  onChange,
  disabled = false,
  compact = false,
  action = 'choose',
  trailing,
}: {
  value?: LayoutKind
  onChange: (layout: LayoutKind) => void
  disabled?: boolean
  compact?: boolean
  action?: 'choose' | 'apply'
  trailing?: ReactNode
}) => {
  const { translate } = useMessages()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<StructureGroup>(() => structureGroupFor(value))
  const searching = query.trim().length > 0
  const active = searching ? 'all' : group
  const groups = filterStructureGroups(translate, group, query)
  return (
    <div className="@container space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            name="diagram-search"
            value={query}
            disabled={disabled}
            aria-label={translate('presetSearch')}
            placeholder={translate('presetSearchPlaceholder')}
            className="h-9 bg-background pr-9 pl-9 text-xs [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query && !isCompositionKey(event.nativeEvent)) {
                event.preventDefault()
                event.stopPropagation()
                setQuery('')
              }
            }}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-0.5 right-0.5 size-8"
              disabled={disabled}
              aria-label={translate('presetClearSearch')}
              onClick={() => {
                setQuery('')
              }}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          )}
        </div>
        {trailing}
      </div>
      <Tabs
        value={active}
        onValueChange={(value) => {
          if (isStructureGroup(value)) {
            setGroup(value)
            setQuery('')
          }
        }}
        className="gap-3"
      >
        <div className="overflow-x-auto pb-1">
          <TabsList
            aria-label={translate('presetCategories')}
            className={cn(
              'h-auto w-max justify-start gap-0.5 bg-secondary/60',
              compact && 'max-w-full flex-wrap',
            )}
          >
            {[{ id: 'all', label: 'presetAll' as const }, ...structureGroups].map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={disabled}
                className="h-7 flex-none px-2.5 text-xs transition-colors"
              >
                {translate(item.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent
          value={active}
          className="space-y-4 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          {groups.length ? (
            groups.map((item) => (
              <section key={item.id} aria-label={item.label} className="space-y-2">
                {(active === 'all' || searching) && (
                  <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {item.label}
                    <span className="text-[11px] tabular-nums">{item.options.length}</span>
                  </h3>
                )}
                <div
                  className={cn(
                    'grid gap-2',
                    compact ? 'grid-cols-2' : 'grid-cols-2 @min-[28rem]:grid-cols-3',
                    !compact && item.options.length >= 4 && '@min-[43rem]:grid-cols-4',
                  )}
                  role="group"
                  aria-label={item.label}
                >
                  {item.options.map(({ value: kind, label }) => (
                    <Button
                      key={kind}
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      aria-label={translate(action === 'apply' ? 'applyValue0' : 'chooseValue0', {
                        value0: label,
                      })}
                      aria-pressed={value === kind}
                      onClick={() => {
                        onChange(kind)
                      }}
                      style={structureAppearance(kind)}
                      className={cn(
                        'h-28 min-w-0 flex-col gap-1 rounded-lg border-border bg-background p-1.5 shadow-none transition-[border-color,box-shadow] hover:border-ring/60 hover:bg-background aria-pressed:border-primary aria-pressed:bg-background aria-pressed:ring-1 aria-pressed:ring-primary/25 dark:bg-background dark:hover:bg-background',
                        compact && 'h-24',
                      )}
                    >
                      <span className="flex min-h-0 w-full flex-1 items-center rounded-md bg-[color-mix(in_srgb,var(--structure-color)_6%,var(--ui-background))] px-2 py-1">
                        <StructurePreview kind={kind} className={compact ? 'h-11' : 'h-16'} />
                      </span>
                      <span className="flex min-h-6 w-full items-center justify-between gap-1 px-1 text-xs text-foreground">
                        <span className="min-w-0 text-left leading-snug whitespace-normal">
                          {label}
                        </span>
                        {value === kind && (
                          <Check aria-hidden="true" className="size-3.5 shrink-0" />
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div
              role="status"
              className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground"
            >
              {translate('presetNoResults')}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
