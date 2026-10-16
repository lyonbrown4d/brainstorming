import { DropdownMenu, Tabs } from 'radix-ui'
import { useEffect, useRef } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditor } from '../state/editor'
import type { SheetDialogAction } from './SheetDialog'

interface SheetTabItemProps {
  sheet: { id: string; name: string }
  index: number
  count: number
  busy: boolean
  onDialog: (action: SheetDialogAction) => void
}

export function SheetTabItem({ sheet, index, count, busy, onDialog }: SheetTabItemProps) {
  const active = useEditor((state) => state.activeSheetId === sheet.id)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) trigger.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sheet.id, disabled: busy })
  return (
    <div
      ref={setNodeRef}
      className="sheet-tab-item"
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="sheet-drag-handle"
        disabled={busy}
        {...attributes}
        {...listeners}
        aria-label={`拖动画布 ${sheet.name}`}
        title="拖动排序，也可在画布菜单中移动"
      >
        <GripVertical size={12} />
      </button>
      <Tabs.Trigger
        ref={trigger}
        value={sheet.id}
        className="sheet-tab"
        aria-controls="sheet-panel"
        disabled={busy}
        title={sheet.name}
        onFocus={(event) => {
          event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }}
      >
        {sheet.name}
      </Tabs.Trigger>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="sheet-menu-trigger"
          aria-label={`画布菜单 ${sheet.name}`}
          disabled={busy}
        >
          <ChevronDown size={13} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="sheet-menu" side="top" align="start" sideOffset={8}>
            <DropdownMenu.Item
              onSelect={() => {
                onDialog({ kind: 'rename', ...sheet })
              }}
            >
              重命名画布
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                useEditor.getState().duplicateSheet(sheet.id)
              }}
            >
              复制画布
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              disabled={index === 0}
              onSelect={() => {
                useEditor.getState().moveSheet(sheet.id, index - 1)
              }}
            >
              向左移动
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={index === count - 1}
              onSelect={() => {
                useEditor.getState().moveSheet(sheet.id, index + 1)
              }}
            >
              向右移动
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              className="sheet-menu-danger"
              disabled={count <= 1}
              onSelect={() => {
                onDialog({ kind: 'delete', ...sheet })
              }}
            >
              删除画布
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
