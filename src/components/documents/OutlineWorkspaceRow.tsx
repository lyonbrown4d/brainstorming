import { useEffect, type KeyboardEvent } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { Button } from '@renderer/components/ui/button'
import { useEditor } from '@renderer/state/editor'
import { selectTopic, useTopicSelected } from '@renderer/state/selection'
import { useMessages } from '@renderer/i18n/useMessages'
import {
  outlineDropCommand,
  type OutlineDropPosition,
} from '@renderer/components/documents/OutlineWorkspaceActions'
import type { OutlineRow } from '@renderer/components/documents/OutlineWorkspaceModel'

const OutlineDropZone = ({
  id,
  position,
  draggingId,
}: {
  id: string
  position: OutlineDropPosition
  draggingId: string | null
}) => {
  const document = useEditor((state) => state.history.document)
  const valid =
    draggingId !== null && outlineDropCommand(document, draggingId, id, position) !== undefined
  const { setNodeRef, isOver } = useDroppable({
    id: `${position}:${id}`,
    data: { topicId: id, position },
    disabled: !valid,
  })
  return (
    <div
      ref={setNodeRef}
      data-outline-drop={position}
      data-drop-active={(isOver && valid) || undefined}
      className={`pointer-events-none absolute inset-x-0 z-10 ${position === 'before' ? 'top-0 h-3 data-[drop-active=true]:border-t-2' : position === 'after' ? 'bottom-0 h-3 data-[drop-active=true]:border-b-2' : 'inset-y-3 rounded-md data-[drop-active=true]:bg-primary/10 data-[drop-active=true]:ring-2 data-[drop-active=true]:ring-primary'} border-primary`}
    />
  )
}

export const OutlineWorkspaceRow = ({
  row,
  collapsed,
  draggingId,
  onCollapse,
  onKeyDown,
}: {
  row: OutlineRow
  collapsed: boolean
  draggingId: string | null
  onCollapse: (id: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) => {
  const { translate } = useMessages()
  const topic = useEditor((state) => state.history.document.topics[row.id])
  const root = useEditor((state) => state.history.document.rootId === row.id)
  const floatingIds = useEditor((state) => state.history.document.floatingIds)
  const editing = useEditor(
    (state) => state.editingId === row.id && state.editingSurface === 'outline',
  )
  const primary = useEditor((state) => state.selectedId === row.id)
  const selected = useTopicSelected(row.id)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    disabled: root,
  })
  useEffect(() => {
    if (editing) window.document.getElementById(`topic-outline-${row.id}`)?.focus()
    else if (primary && window.document.activeElement === window.document.body)
      window.document.getElementById(`outline-row-${row.id}`)?.focus({ preventScroll: true })
  }, [editing, primary, row.id])
  if (!topic) return null
  const childCount = root
    ? topic.children.filter((id) => !floatingIds?.includes(id)).length
    : topic.children.length
  return (
    <div
      ref={setNodeRef}
      id={`outline-row-${row.id}`}
      role="treeitem"
      aria-label={topic.title}
      aria-level={row.depth + 1}
      aria-posinset={row.siblingIndex + 1}
      aria-setsize={row.siblingCount}
      aria-selected={selected}
      aria-expanded={childCount ? !collapsed : undefined}
      tabIndex={primary && !editing ? 0 : -1}
      data-outline-topic={row.id}
      data-outline-depth={row.depth}
      data-outline-parent={row.parentId ?? ''}
      className={`relative flex min-h-14 items-center gap-1 border-b border-border/50 py-1 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? 'bg-accent/60' : 'hover:bg-muted/40'} ${isDragging ? 'opacity-35' : ''}`}
      style={{ paddingLeft: row.depth * 22 + 8 }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, [contenteditable="true"]')
        )
          return
        selectTopic(row.id, event.metaKey || event.ctrlKey || event.shiftKey)
      }}
    >
      <OutlineDropZone id={row.id} position="before" draggingId={draggingId} />
      <OutlineDropZone id={row.id} position="inside" draggingId={draggingId} />
      <OutlineDropZone id={row.id} position="after" draggingId={draggingId} />
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label={translate('outlineDragTopic', { title: topic.title })}
        disabled={root}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </Button>
      {childCount ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={translate('value0OutlineValue1', {
            value0: translate(collapsed ? 'expand' : 'collapse'),
            value1: topic.title,
          })}
          onClick={() => {
            onCollapse(row.id)
          }}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      ) : (
        <span className="w-7 shrink-0" />
      )}
      <div className="min-w-32 flex-1">
        {editing ? (
          <TopicEditor id={row.id} title={topic.title} surface="outline" />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className={`block min-h-10 w-full whitespace-pre-wrap break-words px-2.5 py-2 text-left text-sm outline-none ${root ? 'font-semibold' : ''}`}
            onClick={(event) => {
              selectTopic(row.id, event.metaKey || event.ctrlKey || event.shiftKey)
              window.document.getElementById(`outline-row-${row.id}`)?.focus()
            }}
            onDoubleClick={() => {
              useEditor.getState().startEdit(row.id, undefined, 'outline', 'end')
            }}
          >
            {topic.title}
          </button>
        )}
      </div>
      {!!childCount && (
        <span className="px-1 text-xs tabular-nums text-muted-foreground">{childCount}</span>
      )}
    </div>
  )
}
