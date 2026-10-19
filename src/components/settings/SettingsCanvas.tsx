import { useId, useState } from 'react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'

export const SettingsCanvas = () => {
  const { translate } = useMessages()
  const minimap = useCanvasPreferences((state) => state.minimap)
  const setMinimap = useCanvasPreferences((state) => state.setMinimap)
  const [failed, setFailed] = useState(false)
  const id = useId()
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Label htmlFor={id}>{translate('canvasMinimap')}</Label>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            {translate('settingsMinimapDescription')}
          </p>
        </div>
        <Checkbox
          id={id}
          checked={minimap}
          onCheckedChange={(value) => {
            setFailed(false)
            try {
              setMinimap(value === true)
            } catch {
              setFailed(true)
            }
          }}
        />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {translate('settingsPreferenceFailed')}
        </p>
      )}
    </div>
  )
}
