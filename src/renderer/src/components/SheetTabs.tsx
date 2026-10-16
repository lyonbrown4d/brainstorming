import { useState } from 'react'
import { Tabs } from 'radix-ui'
import { Plus } from 'lucide-react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { useEditor } from '../state/editor'
import { SheetTabItem } from './SheetTabItem'
import { SheetDialog, type SheetDialogAction } from './SheetDialog'
import { Button } from './ui/button'
import '../styles/sheets.css'

export function SheetTabs() {
  const sheets = useEditor((state) => state.workbook.sheets)
  const activeId = useEditor((state) => state.activeSheetId)
  const busy = useEditor((state) => state.busy)
  const [dialog, setDialog] = useState<SheetDialogAction | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  return (
    <div className="sheet-bar">
      <span className="sheet-bar-label">画布</span>
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
          className="sheet-tabs"
          value={activeId}
          onValueChange={(id) => {
            useEditor.getState().switchSheet(id)
          }}
        >
          <Tabs.List className="sheet-tab-list" aria-label="文档画布">
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
          </Tabs.List>
        </Tabs.Root>
      </DndContext>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="sheet-add"
        aria-label="新建画布"
        title="新建画布"
        disabled={busy}
        onClick={() => {
          useEditor.getState().addSheet()
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
