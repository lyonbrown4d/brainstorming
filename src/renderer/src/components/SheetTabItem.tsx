import { DropdownMenu, Tabs } from 'radix-ui'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronDown, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditor } from '../state/editor'
import { cn } from '../lib/utils'
import type { SheetDialogAction } from './SheetDialog'
import { Button } from './ui/button'

const menuItemClass =
  'cursor-default rounded-md px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40'

interface SheetTabItemProps {
  sheet: { id: string; name: string }
  index: number
  count: number
  busy: boolean
  onDialog: (action: SheetDialogAction) => void
}

export function SheetTabItem({ sheet, index, count, busy, onDialog }: SheetTabItemProps) {
  const active = useEditor((state) => state.activeSheetId === sheet.id)
  const reducedMotion = useReducedMotion()
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
      className="sheet-tab-item group relative flex shrink-0 items-center pr-1 pl-0.5 transition-colors after:absolute after:right-0 after:h-5 after:border-r after:border-border/70 data-[active=true]:bg-accent/60 data-[active=true]:text-primary data-[dragging=true]:z-2 data-[dragging=true]:bg-background data-[dragging=true]:opacity-70 motion-reduce:transition-none"
      data-active={active}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        variant="ghost"
        size="icon"
        ref={setActivatorNodeRef}
        type="button"
        className="sheet-drag-handle h-7 w-3 touch-none cursor-grab rounded p-0 text-inherit opacity-0 transition-opacity group-focus-within:opacity-60 group-hover:opacity-60 active:cursor-grabbing disabled:opacity-40 motion-reduce:transition-none"
        disabled={busy}
        {...attributes}
        {...listeners}
        aria-label={`拖动画布 ${sheet.name}`}
        title="拖动排序，也可在画布菜单中移动"
      >
        <GripVertical size={12} className="size-3" />
      </Button>
      <Tabs.Trigger
        ref={trigger}
        value={sheet.id}
        className="sheet-tab max-w-45 cursor-pointer self-stretch truncate border-0 bg-transparent px-2 text-xs text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-40 data-[state=active]:font-semibold"
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
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="sheet-menu-trigger h-7 w-6 shrink-0 rounded-md p-0 text-inherit"
            aria-label={`画布菜单 ${sheet.name}`}
            disabled={busy}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="sheet-menu z-60 min-w-38 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
            side="top"
            align="start"
            sideOffset={8}
          >
            <DropdownMenu.Item
              className={menuItemClass}
              onSelect={() => {
                onDialog({ kind: 'rename', ...sheet })
              }}
            >
              重命名画布
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              onSelect={() => {
                useEditor.getState().duplicateSheet(sheet.id)
              }}
            >
              复制画布
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border" />
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={index === 0}
              onSelect={() => {
                useEditor.getState().moveSheet(sheet.id, index - 1)
              }}
            >
              向左移动
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={index === count - 1}
              onSelect={() => {
                useEditor.getState().moveSheet(sheet.id, index + 1)
              }}
            >
              向右移动
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border" />
            <DropdownMenu.Item
              className={cn(menuItemClass, 'sheet-menu-danger text-destructive')}
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
      {active && (
        <motion.span
          layoutId="active-sheet-underline"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
          transition={
            reducedMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
          }
        />
      )}
    </div>
  )
}
