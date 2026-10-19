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
    <div className="grid max-w-4xl gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
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
              if (event.key === 'Enter' && isCompositionKey(event.nativeEvent))
                event.preventDefault()
            }}
          />
        </div>
        {draft.layout !== 'none' && (
          <section aria-label={translate('contentTemplate')} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium">{translate('contentTemplate')}</h2>
            <TemplateChoices
              value={draft.template}
              onChange={(template) => {
                onChange({ template })
              }}
              disabled={disabled}
            />
          </section>
        )}
      </div>
      <div
        style={structureAppearance(draft.layout === 'none' ? 'map' : draft.layout)}
        className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground"
      >
        <div className="w-full rounded-md bg-[color-mix(in_srgb,var(--structure-color)_6%,var(--ui-background))] p-3">
          <CreationStructurePreview layout={draft.layout} className="h-24" />
        </div>
        <span>{label}</span>
        {draft.layout === 'none' && <span>{translate('presetCenterOnly')}</span>}
      </div>
    </div>
  )
}
