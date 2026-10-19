import { useId } from 'react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { TemplateChoices } from '@renderer/components/creation/TemplateChoices'
import { CreationStructurePreview } from '@renderer/components/creation/CreationStructurePreview'
import { structureAppearance } from '@renderer/components/creation/structureAppearance'
import { isCompositionKey } from '@renderer/state/keyboard'
import type { CreationRequest } from '@renderer/components/creation/types'

export const CreationSetup = ({
  draft,
  disabled,
  noun,
  placeholder,
  label,
  onChange,
}: {
  draft: CreationRequest
  disabled: boolean
  noun: string
  placeholder: string
  label: string
  onChange: (patch: Partial<CreationRequest>) => void
}) => {
  const { translate } = useMessages()
  const id = useId()
  return (
    <div className="grid items-start gap-x-6 gap-y-5 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={id} className="text-xs">
          {translate('entityName', { name: noun })}
        </Label>
        <Input
          id={id}
          name="title"
          value={draft.title}
          maxLength={80}
          disabled={disabled}
          placeholder={placeholder}
          className="h-9 bg-background text-sm"
          autoComplete="off"
          onChange={(event) => {
            onChange({ title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && isCompositionKey(event.nativeEvent)) event.preventDefault()
          }}
        />
      </div>
      <figure
        data-creation-preview
        style={structureAppearance(draft.layout === 'none' ? 'map' : draft.layout)}
        className="flex items-center gap-3 self-start rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground md:sticky md:top-0 md:col-start-2 md:row-span-2 md:flex-col md:gap-3 md:p-4"
      >
        <div className="w-28 shrink-0 rounded-md bg-[color-mix(in_srgb,var(--structure-color)_6%,var(--ui-background))] p-2 md:w-full md:p-3">
          <CreationStructurePreview layout={draft.layout} className="h-16 md:h-24" />
        </div>
        <figcaption className="flex flex-col gap-1 md:items-center">
          <span>{label}</span>
          {draft.layout === 'none' && <span>{translate('presetCenterOnly')}</span>}
        </figcaption>
      </figure>
      {draft.layout !== 'none' && (
        <section
          aria-label={translate('contentTemplate')}
          className="min-w-0 space-y-2 md:col-start-1"
        >
          <h2 className="text-xs font-medium">{translate('contentTemplate')}</h2>
          <TemplateChoices
            value={draft.template}
            onChange={(template) => {
              onChange({ template })
            }}
            disabled={disabled}
            scrollMode="page"
          />
        </section>
      )}
    </div>
  )
}
