import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'
import { useWorkbenchInsets } from '@renderer/hooks/useWorkbenchInsets'
import { OutlineWorkspaceToolbar } from '@renderer/components/documents/OutlineWorkspaceToolbar'
import { OutlineWorkspaceRow } from '@renderer/components/documents/OutlineWorkspaceRow'
import { outlineRows } from '@renderer/components/documents/OutlineWorkspaceModel'
import {
  outlineDropCommand,
  runOutlineAction,
} from '@renderer/components/documents/OutlineWorkspaceActions'
import {
  emptyOutlineSession,
  outlineSessionKey,
  updateOutlineSession,
  useOutlineWorkspaceState,
} from '@renderer/components/documents/OutlineWorkspaceState'
import { useOutlineWorkspaceNavigation } from '@renderer/components/documents/useOutlineWorkspaceNavigation'

export const OutlineWorkspace = () => {
  'use no memo'
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const selectedId = useEditor((state) => state.selectedId)
  const editingId = useEditor((state) =>
    state.editingSurface === 'outline' ? state.editingId : null,
  )
  const key = outlineSessionKey(workbookId, sheetId)
  const session = useOutlineWorkspaceState((state) => state.sessions[key] ?? emptyOutlineSession)
  const insets = useWorkbenchInsets()
  const rows = useMemo(
    () => outlineRows(document, session.collapsed, selectedId),
    [document, session.collapsed, selectedId],
  )
  const scroll = useRef<HTMLDivElement>(null)
  const previousSelection = useRef(selectedId)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const activeIndex = rows.findIndex((row) => row.id === editingId)
  const selectedIndex = rows.findIndex((row) => row.id === selectedId)
  const dragIndex = rows.findIndex((row) => row.id === draggingId)
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 56,
    getItemKey: (index) => rows[index]?.id ?? index,
    initialOffset: session.scrollTop,
    overscan: 8,
    rangeExtractor: (range) =>
      [
        ...new Set(
          [...defaultRangeExtractor(range), activeIndex, selectedIndex, dragIndex].filter(
            (index) => index >= 0,
          ),
        ),
      ].sort((left, right) => left - right),
  })
  useEffect(() => {
    scroll.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (previousSelection.current === selectedId && !editingId) return
    previousSelection.current = selectedId
    const index = rows.findIndex((row) => row.id === selectedId)
    if (index >= 0) virtual.scrollToIndex(index, { align: 'auto' })
  }, [editingId, rows, selectedId, virtual])
  const onCollapse = (id: string): void => {
    runOutlineAction(() => {
      useEditor.getState().select(id)
      updateOutlineSession(key, {
        collapsed: session.collapsed.includes(id)
          ? session.collapsed.filter((entry) => entry !== id)
          : [...session.collapsed, id],
      })
    })
  }
  const onKeyDown = useOutlineWorkspaceNavigation(rows, session.collapsed, onCollapse)
  return (
    <section
      className="absolute inset-y-0 z-20 flex min-w-0 flex-col bg-background"
      style={insets}
      aria-label={translate('outlineWorkspace')}
      data-outline-workspace
    >
      <OutlineWorkspaceToolbar />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => {
          useEditor.getState().commitDraft()
          useEditor.getState().select(String(active.id))
          setDraggingId(String(active.id))
          setDropHint(translate('outlineDragHint'))
        }}
        onDragOver={({ over }) => {
          const position: unknown = over?.data.current?.position
          setDropHint(
            position === 'before'
              ? translate('outlineDropBefore')
              : position === 'after'
                ? translate('outlineDropAfter')
                : position === 'inside'
                  ? translate('outlineDropInside')
                  : translate('outlineDragHint'),
          )
        }}
        onDragCancel={() => {
          setDraggingId(null)
          setDropHint('')
        }}
        onDragEnd={({ active, over }) => {
          setDraggingId(null)
          setDropHint('')
          const targetId: unknown = over?.data.current?.topicId
          const position: unknown = over?.data.current?.position
          if (
            typeof targetId !== 'string' ||
            !['before', 'inside', 'after'].includes(String(position))
          )
            return
          if (position !== 'before' && position !== 'inside' && position !== 'after') return
          runOutlineAction(() => {
            const state = useEditor.getState()
            const command = outlineDropCommand(
              state.history.document,
              String(active.id),
              targetId,
              position,
            )
            if (command) state.command(command)
          })
        }}
      >
        <div
          ref={scroll}
          role="tree"
          aria-label={translate('editableOutline')}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            updateOutlineSession(key, { scrollTop: event.currentTarget.scrollTop })
          }}
          className="min-h-0 flex-1 overflow-auto px-2 py-3 outline-none [scrollbar-width:thin] sm:px-6"
        >
          <div className="relative min-w-full" style={{ height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((item) => {
              const row = rows[item.index]
              if (!row) return null
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtual.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <OutlineWorkspaceRow
                    row={row}
                    collapsed={
                      session.collapsed.includes(row.id) &&
                      !rows.some((entry) => entry.parentId === row.id)
                    }
                    draggingId={draggingId}
                    onCollapse={onCollapse}
                    onKeyDown={onKeyDown}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingId && (
            <div className="max-w-sm truncate rounded-md border border-border bg-background px-4 py-3 text-sm shadow-floating">
              {document.topics[draggingId]?.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <div
        role="status"
        aria-live="polite"
        className="min-h-6 shrink-0 px-6 text-xs text-muted-foreground"
      >
        {dropHint}
      </div>
    </section>
  )
}
