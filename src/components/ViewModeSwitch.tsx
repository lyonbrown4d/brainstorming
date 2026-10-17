import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { defaultSpatialView, useSpatialView, type ViewMode } from '@renderer/state/spatial'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'

export const changeViewMode = (mode: ViewMode): boolean => {
  useEditor.getState().commitDraft()
  const editor = useEditor.getState()
  if (editor.editingId) return false
  useSpatialView.getState().setMode(editor.activeSheetId, mode)
  return true
}

export const ViewModeSwitch = () => {
  const { translate } = useMessages()

  const sheetId = useEditor((state) => state.activeSheetId)
  const busy = useEditor((state) => state.busy)
  const mode = useSpatialView((state) => state.sheets[sheetId]?.mode ?? defaultSpatialView.mode)
  return (
    <ToggleGroup
      type="single"
      value={mode}
      disabled={busy}
      onValueChange={(value) => {
        if (value === '2d' || value === '3d') changeViewMode(value)
      }}
      role="group"
      aria-label={translate('canvasDimension')}
      data-no-drag
      className="shrink-0 rounded-lg border border-border bg-background p-0.5"
    >
      {(['2d', '3d'] as const).map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          role="button"
          aria-checked={undefined}
          size="sm"
          aria-label={value === '2d' ? translate('2dView') : translate('3dView')}
          aria-pressed={mode === value}
          className="h-8 min-w-10 px-2 sm:min-w-12 sm:px-3"
        >
          {value === '2d' ? '2D' : '3D'}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
