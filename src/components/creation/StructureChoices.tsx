import { CircleDot, Check } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { StructureBrowser } from '@renderer/components/documents/StructureBrowser'
import type { CreationLayout } from '@renderer/components/creation/types'

export const StructureChoices = ({
  value,
  onChange,
  disabled,
}: {
  value: CreationLayout
  onChange: (layout: CreationLayout) => void
  disabled: boolean
}) => {
  const { translate } = useMessages()
  return (
    <div className="space-y-4" role="group" aria-label={translate('chooseStructure')}>
      <StructureBrowser
        {...(value === 'none' ? {} : { value })}
        onChange={onChange}
        disabled={disabled}
        trailing={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={value === 'none'}
            onClick={() => {
              onChange('none')
            }}
            className="gap-2 border-border bg-background text-xs shadow-none aria-pressed:border-primary aria-pressed:bg-accent"
          >
            <CircleDot aria-hidden="true" className="size-3.5" />
            {translate('presetNone')}
            {value === 'none' && <Check aria-hidden="true" className="size-3.5" />}
          </Button>
        }
      />
    </div>
  )
}
