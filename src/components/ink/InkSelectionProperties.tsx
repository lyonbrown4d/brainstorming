import { PenLine, Trash2 } from 'lucide-react'
import { useSelectedDrawingIds, deleteSelectedTopics } from '@renderer/state/selection'
import { useEditor } from '@renderer/state/editor'
import { inkGeometry } from '@shared/ink-geometry'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'

/** Ink selection never exposes the last active topic's edit fields. */
export const InkSelectionProperties = () => {
  const { translate } = useMessages()
  const ids = useSelectedDrawingIds()
  const drawings = useEditor((state) => state.history.document.drawings)
  const busy = useEditor((state) => state.busy)
  const bounds =
    drawings
      ?.filter((stroke) => ids.includes(stroke.id))
      .map((stroke) => inkGeometry(stroke).bounds) ?? []
  if (!bounds.length) return null
  const x = Math.min(...bounds.map((entry) => entry.x)),
    y = Math.min(...bounds.map((entry) => entry.y))
  const width = Math.max(...bounds.map((entry) => entry.x + entry.width)) - x
  const height = Math.max(...bounds.map((entry) => entry.y + entry.height)) - y
  return (
    <section aria-label={translate('inkStroke')} className="space-y-4 border-b py-5">
      <h3 className="flex items-center gap-2 font-medium">
        <PenLine className="size-4" />
        {translate('inkSelected', { count: bounds.length })}
      </h3>
      <p className="font-mono text-xs text-muted-foreground">
        {Math.round(width)} × {Math.round(height)}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={deleteSelectedTopics}
      >
        <Trash2 className="size-3.5" />
        {translate('inkDeleteSelection')}
      </Button>
    </section>
  )
}
