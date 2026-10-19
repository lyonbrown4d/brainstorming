import {
  ArrowDown,
  ArrowUp,
  GalleryHorizontalEnd,
  List,
  Network,
  PanelsTopLeft,
} from 'lucide-react'
import type { PresentationStep } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'

interface PresentationPageSettingsProps {
  step: PresentationStep
  title: string
  index: number
  total: number
  busy: boolean
  onChange: (patch: Partial<PresentationStep>) => void
  onMove: (offset: 1 | -1) => void
}

export const PresentationPageSettings = ({
  step,
  title,
  index,
  total,
  busy,
  onChange,
  onMove,
}: PresentationPageSettingsProps) => {
  const { translate } = useMessages()
  const layouts = [
    { value: 'auto', label: translate('presentationLayoutAuto'), icon: PanelsTopLeft },
    { value: 'list', label: translate('presentationLayoutList'), icon: List },
    { value: 'image', label: translate('presentationLayoutImage'), icon: GalleryHorizontalEnd },
    { value: 'structure', label: translate('presentationLayoutStructure'), icon: Network },
  ] as const
  return (
    <aside
      className="w-64 shrink-0 space-y-6 overflow-auto border-l bg-background p-5 max-lg:w-full max-lg:border-t max-lg:border-l-0"
      aria-label={translate('presentationSettings')}
    >
      <h2 className="break-words border-b pb-5 text-lg font-semibold">{title}</h2>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-3 text-sm font-medium">{translate('presentationLayout')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {layouts.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={
                step.layout === value || (!step.layout && value === 'auto')
                  ? 'secondary'
                  : 'outline'
              }
              className="h-16 flex-col gap-1 text-xs"
              aria-pressed={step.layout === value || (!step.layout && value === 'auto')}
              onClick={() => {
                onChange({ layout: value })
              }}
            >
              <Icon className="size-5" />
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-3 border-t pt-5">
        <p className="text-sm font-medium" id="presentation-reveal-label">
          {translate('presentationReveal')}
        </p>
        <Select
          value={step.reveal ?? 'all'}
          disabled={busy}
          onValueChange={(value) => {
            if (value === 'all' || value === 'items') onChange({ reveal: value })
          }}
        >
          <SelectTrigger className="w-full" aria-labelledby="presentation-reveal-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate('presentationRevealAll')}</SelectItem>
            <SelectItem value="items">{translate('presentationRevealItems')}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 py-2 text-sm">
          <Checkbox
            checked={step.hidden ?? false}
            disabled={busy}
            onCheckedChange={(value) => {
              onChange({ hidden: value === true })
            }}
          />
          {translate('presentationHidePage')}
        </label>
      </div>
      <div className="flex gap-2 border-t pt-5">
        <Button
          variant="outline"
          className="flex-1"
          size="sm"
          disabled={busy || index === 0}
          onClick={() => {
            onMove(-1)
          }}
          aria-label={translate('presentationMoveUp')}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          size="sm"
          disabled={busy || index === total - 1}
          onClick={() => {
            onMove(1)
          }}
          aria-label={translate('presentationMoveDown')}
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
