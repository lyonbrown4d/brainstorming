import { CopyPlus, PlusSquare, Redo2, Undo2 } from 'lucide-react'
import { useEditor } from '../state/editor'
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
  return (
    <div className="floating-toolbar" role="toolbar" aria-label="导图操作">
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
    </div>
  )
}
