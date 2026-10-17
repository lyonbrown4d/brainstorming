import { useId, useState } from 'react'
import { LayoutGroup } from 'motion/react'
import { Tabs } from 'radix-ui'
import { Plus } from 'lucide-react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { useEditor } from '@renderer/state/editor'
import { SheetTabItem } from '@renderer/components/SheetTabItem'
import { SheetDialog, type SheetDialogAction } from '@renderer/components/SheetDialog'
import { Button } from '@renderer/components/ui/button'
import '@renderer/styles/sheets.css'
import { beginCreation } from '@renderer/state/creation'

export const SheetTabs = () => {
  const layoutId = useId()
  const sheets = useEditor((state) => state.workbook.sheets)
  const activeId = useEditor((state) => state.activeSheetId)
  const busy = useEditor((state) => state.busy)
  const [dialog, setDialog] = useState<SheetDialogAction | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  return (
    <div className="sheet-bar flex h-12 min-w-0 flex-1 items-center bg-background text-muted-foreground">
      <span className="sheet-bar-label flex h-5 shrink-0 items-center border-r border-border px-5 text-xs">
        画布
      </span>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id || busy) return
          const index = sheets.findIndex((sheet) => sheet.id === over.id)
          if (index >= 0) useEditor.getState().moveSheet(String(active.id), index)
        }}
      >
        <Tabs.Root
          className="sheet-tabs min-w-0 overflow-x-auto [scrollbar-width:thin]"
          value={activeId}
          onValueChange={(id) => {
            useEditor.getState().switchSheet(id)
          }}
        >
          <Tabs.List className="sheet-tab-list flex h-12 w-max min-w-full" aria-label="文档画布">
            <LayoutGroup id={layoutId}>
              <SortableContext
                items={sheets.map((sheet) => sheet.id)}
                strategy={horizontalListSortingStrategy}
              >
                {sheets.map((sheet, index) => (
                  <SheetTabItem
                    key={sheet.id}
                    sheet={sheet}
                    index={index}
                    count={sheets.length}
                    busy={busy}
                    onDialog={setDialog}
                  />
                ))}
              </SortableContext>
            </LayoutGroup>
          </Tabs.List>
        </Tabs.Root>
      </DndContext>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="sheet-add mx-1 size-8 shrink-0 rounded-lg p-0 text-muted-foreground hover:text-primary"
        aria-label="新建画布"
        title="新建画布"
        disabled={busy}
        onClick={() => {
          beginCreation('sheet')
        }}
      >
        <Plus size={18} className="size-[18px]" />
      </Button>
      {dialog && (
        <SheetDialog
          key={`${dialog.kind}-${dialog.id}`}
          action={dialog}
          busy={busy}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
