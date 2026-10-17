import { CopyPlus, PlusSquare, Redo2, Undo2 } from 'lucide-react'
import { DockToolbar } from '@renderer/components/DockToolbar'
import { DockAction } from '@renderer/components/DockAction'
import { TopicFormatting } from '@renderer/components/TopicFormatting'
import { SelectionToolbar } from '@renderer/components/SelectionToolbar'
import { AIAssistant } from '@renderer/components/ai/AIAssistant'
import { MCPDialog } from '@renderer/components/mcp/MCPDialog'
import { FileSecurity } from '@renderer/components/files/FileSecurity'
import { HistoryDialog } from '@renderer/components/files/HistoryDialog'
import { TopicFilter } from '@renderer/components/documents/TopicFilter'
import {
  AnnotationActions,
  AnnotationModeHint,
} from '@renderer/components/annotations/AnnotationActions'
import { AnnotationStyleControls } from '@renderer/components/annotations/AnnotationStyleControls'
import { MarkerAction } from '@renderer/components/metadata/MarkerAction'
import { LinkAction } from '@renderer/components/metadata/LinkAction'
import { EditActions } from '@renderer/components/EditActions'
import { ImportTextDialog } from '@renderer/components/ImportTextDialog'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { StructurePicker } from '@renderer/components/documents/StructurePicker'
import { DocumentSettingsPanel } from '@renderer/components/documents/DocumentSettingsPanel'
import { TemplateDialog } from '@renderer/components/documents/TemplateDialog'
import { OutlineEditor } from '@renderer/components/documents/OutlineEditor'
import { PresentationControls } from '@renderer/components/documents/PresentationControls'
import { FloatingActions } from '@renderer/components/documents/FloatingActions'
import { isDirty, useEditor } from '@renderer/state/editor'
import { Separator } from '@renderer/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { ComponentProps, ReactNode } from 'react'

const Action = ({
  label,
  hint,
  caption,
  children,
  ...props
}: ComponentProps<typeof DockAction> & { label: string; hint: string; children: ReactNode }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DockAction aria-label={label} caption={caption} {...props}>
          {children}
        </DockAction>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

const DockGroup = ({ children, label }: { children: ReactNode; label: string }) => {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0.5 [&>button:not([data-dock-action])]:h-12 [&>button:not([data-dock-action])]:min-w-11 [&>button:not([data-dock-action])]:flex-col [&>button:not([data-dock-action])]:gap-1 [&>button:not([data-dock-action])]:rounded-xl [&>button:not([data-dock-action])]:border-transparent [&>button:not([data-dock-action])]:bg-transparent [&>button:not([data-dock-action])]:px-2 [&>button:not([data-dock-action])]:text-[11px] [&>button:not([data-dock-action])]:leading-none [&>button:not([data-dock-action])]:font-normal [&>button:not([data-dock-action])]:text-muted-foreground [&>button:not([data-dock-action])]:shadow-none [&>button:not([data-dock-action]):hover]:bg-accent [&>button:not([data-dock-action]):hover]:text-accent-foreground"
    >
      {children}
    </div>
  )
}

export const FloatingToolbar = () => {
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
        className="flex h-12 w-max flex-nowrap items-center gap-1 whitespace-nowrap"
        role="toolbar"
        aria-label="导图操作"
      >
        <DockGroup label="创建与关联">
          <Action
            label="添加同级主题"
            hint="添加同级主题 Enter"
            caption="主题"
            onClick={() => {
              useEditor.getState().add('sibling')
            }}
          >
            <PlusSquare size={19} />
          </Action>
          <Action
            label="添加子主题"
            hint="添加子主题 Tab"
            caption="子主题"
            onClick={() => {
              useEditor.getState().add('child')
            }}
          >
            <CopyPlus size={19} />
          </Action>
          <AnnotationActions />
          <LinkAction />
          <MarkerAction />
        </DockGroup>
        <Separator orientation="vertical" className="mx-1 h-7 opacity-70" />
        <TopicFormatting compact />
        <AnnotationStyleControls />
        <Separator orientation="vertical" className="mx-1 h-7 opacity-70" />
        <DockGroup label="历史与编辑">
          <Action
            label="撤销"
            hint="撤销 ⌘Z"
            caption="撤销"
            disabled={!canUndo}
            onClick={() => {
              useEditor.getState().undo()
            }}
          >
            <Undo2 size={19} />
          </Action>
          <Action
            label="重做"
            hint="重做 ⇧⌘Z"
            caption="重做"
            disabled={!canRedo}
            onClick={() => {
              useEditor.getState().redo()
            }}
          >
            <Redo2 size={19} />
          </Action>
          <EditActions />
          <SelectionToolbar />
        </DockGroup>
        <Separator orientation="vertical" className="mx-1 h-7 opacity-70" />
        <DockGroup label="画布与结构">
          <StructurePicker />
          <DocumentSettingsPanel />
          <TopicFilter />
          <TemplateDialog />
          <FloatingActions />
          <OutlineEditor />
          <PresentationControls />
        </DockGroup>
        <Separator orientation="vertical" className="mx-1 h-7 opacity-70" />
        <DockGroup label="文件与助手">
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
          <MCPDialog />
        </DockGroup>
      </div>
    </DockToolbar>
  )
}
