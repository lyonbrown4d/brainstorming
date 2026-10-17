import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import type { DocumentSettings } from '@core'
import { mapPalettes, type PaletteId } from '@shared/palettes'
import { Button } from '@renderer/components/ui/button'
import { PalettePreview } from '@renderer/components/appearance/PalettePreview'

export const PaletteChooser = ({
  settings,
  onSelect,
}: {
  settings: DocumentSettings
  onSelect: (id: PaletteId) => void
}) => {
  const { translate, translateLabel } = useMessages()

  const selected = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [settings.theme, settings.customPalette])
  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="group"
      aria-label={translate('mapColorPresets')}
      data-palette-options
    >
      {mapPalettes.map((palette) => (
        <Button
          key={palette.id}
          ref={
            !settings.customPalette && (settings.theme ?? 'brainstorming') === palette.id
              ? selected
              : undefined
          }
          type="button"
          variant="outline"
          aria-label={translate('useValue0Colors', { value0: translateLabel(palette.name) })}
          aria-pressed={
            !settings.customPalette && (settings.theme ?? 'brainstorming') === palette.id
          }
          className="relative h-auto min-w-0 flex-col gap-0 overflow-hidden rounded-lg border-border p-0 shadow-none hover:bg-accent aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
          onClick={() => {
            onSelect(palette.id)
          }}
        >
          <PalettePreview palette={palette} />
          <span className="py-1.5 text-xs font-normal">{translateLabel(palette.name)}</span>
          {!settings.customPalette && (settings.theme ?? 'brainstorming') === palette.id && (
            <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
              <Check className="size-3" />
            </span>
          )}
        </Button>
      ))}
    </div>
  )
}
