import {
  ArrowLeft,
  CornerDownRight,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'
import {
  addOutlineTopic,
  indentOutlineSelection,
  runOutlineAction,
  setOutlineWorkspaceOpen,
} from '@renderer/components/documents/OutlineWorkspaceActions'

export const OutlineWorkspaceToolbar = () => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  const root = useEditor((state) => state.selectedId === state.history.document.rootId)
  const canUndo = useEditor(
    (state) =>
      state.history.past.length > 0 || state.structurePast.length > 0 || state.editingId !== null,
  )
  const canRedo = useEditor(
    (state) => state.history.future.length > 0 || state.structureFuture.length > 0,
  )
  return (
    <header className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-12 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">{translate('outlineWorkspace')}</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOutlineWorkspaceOpen(false)
          }}
        >
          <ArrowLeft className="size-4" />
          {translate('returnToCanvas')}
        </Button>
      </div>
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1"
        role="toolbar"
        aria-label={translate('editOutline')}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            addOutlineTopic('sibling')
          }}
        >
          <Plus className="size-4" />
          {translate('outlineAddSibling')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            addOutlineTopic('child')
          }}
        >
          <CornerDownRight className="size-4" />
          {translate('outlineAddChild')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || root}
          aria-label={translate('outlineIndent')}
          onClick={() => {
            indentOutlineSelection(1)
          }}
        >
          <IndentIncrease className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || root}
          aria-label={translate('outlineOutdent')}
          onClick={() => {
            indentOutlineSelection(-1)
          }}
        >
          <IndentDecrease className="size-4" />
        </Button>
        <span className="mx-2 h-5 w-px shrink-0 bg-border" />
        <Button
          variant="ghost"
          size="icon"
          aria-label={translate('undo')}
          disabled={busy || !canUndo}
          onClick={() => {
            runOutlineAction(() => {
              useEditor.getState().undo()
            })
          }}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || !canRedo}
          aria-label={translate('redo')}
          onClick={() => {
            runOutlineAction(() => {
              useEditor.getState().redo()
            })
          }}
        >
          <Redo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || root}
          aria-label={translate('deleteSelectedTopics')}
          onClick={() => {
            runOutlineAction(() => {
              useEditor.getState().remove()
            })
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {translate('outlineWorkspaceHint')}
      </p>
    </header>
  )
}
