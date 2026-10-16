import { useEditor } from '../state/editor'
import { defaultSpatialView, useSpatialView, type ViewMode } from '../state/spatial'
import { Button } from './ui/button'

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
    <div
      role="group"
      aria-label="画布维度"
      data-no-drag
      className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background p-0.5 shadow-xs lg:absolute lg:left-1/2 lg:-translate-x-1/2"
    >
      {(['2d', '3d'] as const).map((value) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          aria-label={value === '2d' ? '二维视图' : '三维视图'}
          aria-pressed={mode === value}
          disabled={busy}
          className="h-8 min-w-12 rounded-md px-3 text-xs text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground xl:min-w-16"
          onClick={() => changeViewMode(value)}
        >
          {value === '2d' ? '2D' : '3D'}
        </Button>
      ))}
    </div>
  )
}
