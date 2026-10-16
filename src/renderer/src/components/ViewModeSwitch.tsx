import { useEditor } from '../state/editor'
import { defaultSpatialView, useSpatialView, type ViewMode } from '../state/spatial'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function changeViewMode(mode: ViewMode): boolean {
  useEditor.getState().commitDraft()
  const editor = useEditor.getState()
  if (editor.editingId) return false
  useSpatialView.getState().setMode(editor.activeSheetId, mode)
  return true
}

export function ViewModeSwitch() {
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
      aria-label="画布维度"
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
          aria-label={value === '2d' ? '二维视图' : '三维视图'}
          aria-pressed={mode === value}
          className="h-8 min-w-10 px-2 sm:min-w-12 sm:px-3"
        >
          {value === '2d' ? '2D' : '3D'}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
