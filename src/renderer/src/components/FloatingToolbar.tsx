import { CopyPlus, PlusSquare, Redo2, Undo2 } from 'lucide-react'
import { DockToolbar } from './DockToolbar'
import { TopicFormatting } from './TopicFormatting'
import { SelectionToolbar } from './SelectionToolbar'
import { AIAssistant } from './ai/AIAssistant'
import { FileSecurity } from './files/FileSecurity'
import { HistoryDialog } from './files/HistoryDialog'
import { TopicFilter } from './documents/TopicFilter'
import { AnnotationActions, AnnotationModeHint } from './annotations/AnnotationActions'
import { AnnotationStyleControls } from './annotations/AnnotationStyleControls'
import { MarkerAction } from './metadata/MarkerAction'
import { LinkAction } from './metadata/LinkAction'
import { EditActions } from './EditActions'
import { ImportTextDialog } from './ImportTextDialog'
import { ExportDialog } from './ExportDialog'
import { StructurePicker } from './documents/StructurePicker'
import { DocumentSettingsPanel } from './documents/DocumentSettingsPanel'
import { TemplateDialog } from './documents/TemplateDialog'
import { OutlineEditor } from './documents/OutlineEditor'
import { PresentationControls } from './documents/PresentationControls'
import { FloatingActions } from './documents/FloatingActions'
import { isDirty, useEditor } from '../state/editor'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import type { ComponentProps, ReactNode } from 'react'

function Action({
  label,
  hint,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; hint: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function FloatingToolbar() {
  const canUndo = useEditor(
    (state) =>
      state.history.past.length > 0 || state.structurePast.length > 0 || state.editingId !== null,
  )
  const canRedo = useEditor(
    (state) => state.history.future.length > 0 || state.structureFuture.length > 0,
  )
  const workbook = useEditor((state) => state.workbook)
  const sheetId = useEditor((state) => state.activeSheetId)
  return (
    <DockToolbar hint={<AnnotationModeHint />}>
      <div
        className="flex h-10 w-max flex-nowrap items-center gap-0.5 whitespace-nowrap [&>button]:h-9 [&>button]:gap-1.5 [&>button]:rounded-xl [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-xs [&>button]:shadow-none [&>button:hover]:bg-accent [&>button>span]:hidden lg:[&>button>span]:inline [&>div]:shrink-0 [&>span]:shrink-0"
        role="toolbar"
        aria-label="导图操作"
      >
        <Action
          label="添加同级主题"
          hint="添加同级主题 Enter"
          onClick={() => {
            useEditor.getState().add('sibling')
          }}
        >
          <PlusSquare size={19} />
          <span>主题</span>
        </Action>
        <Action
          label="添加子主题"
          hint="添加子主题 Tab"
          onClick={() => {
            useEditor.getState().add('child')
          }}
        >
          <CopyPlus className="add-child-icon" size={19} />
          <span>子主题</span>
        </Action>
        <span className="toolbar-separator" />
        <TopicFormatting compact />
        <AnnotationActions />
        <LinkAction />
        <MarkerAction />
        <AnnotationStyleControls />
        <span className="toolbar-separator" />
        <Action
          label="撤销"
          hint="撤销 ⌘Z"
          disabled={!canUndo}
          onClick={() => {
            useEditor.getState().undo()
          }}
        >
          <Undo2 size={19} />
          <span>撤销</span>
        </Action>
        <Action
          label="重做"
          hint="重做 ⇧⌘Z"
          disabled={!canRedo}
          onClick={() => {
            useEditor.getState().redo()
          }}
        >
          <Redo2 size={19} />
          <span>重做</span>
        </Action>
        <EditActions />
        <SelectionToolbar />
        <span className="toolbar-separator" />
        <StructurePicker />
        <DocumentSettingsPanel />
        <TopicFilter />
        <TemplateDialog />
        <FloatingActions />
        <OutlineEditor />
        <PresentationControls />
        <span className="toolbar-separator" />
        <ImportTextDialog
          onImport={(document) => {
            const state = useEditor.getState()
            state.commitDraft()
            if (useEditor.getState().editingId || state.busy) return false
            if (isDirty() && !window.confirm('放弃当前更改并导入大纲？')) return false
            state.replace(document, null, true)
            return true
          }}
        />
        <ExportDialog
          workbook={workbook}
          currentSheetId={sheetId}
          {...(window.trelyx
            ? {
                onExport: (request) =>
                  window.trelyx ? window.trelyx.exportFile(request) : Promise.resolve(null),
              }
            : {})}
        />
        <FileSecurity />
        <HistoryDialog />
        <AIAssistant onAddSheet={(document) => useEditor.getState().addDocumentSheet(document)} />
      </div>
    </DockToolbar>
  )
}
