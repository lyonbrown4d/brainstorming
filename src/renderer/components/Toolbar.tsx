import type { ComponentProps, ReactNode } from 'react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Check, FilePlus2, FolderOpen, ListTree, Redo2, Save, Undo2, Download } from 'lucide-react'
import { useEditor, editorIsDirty } from '../state/editor'
import { newDocument, openDocument, saveDocument } from '../state/files'
function ToolbarAction({
  label,
  hint,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; hint: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function Toolbar() {
  const title = useEditor((state) => state.history.document.title)
  const path = useEditor((state) => state.path)
  const history = useEditor((state) => state.history)
  const editingId = useEditor((state) => state.editingId)
  const busy = useEditor((state) => state.busy)
  const outline = useEditor((state) => state.outlineOpen)
  const dirty = useEditor(editorIsDirty)
  return (
    <header className="toolbar">
      <div className="document-identity">
        <div className="document-breadcrumb">
          我的工作空间 <span>/</span> 思维导图
        </div>
        <div className="document-title">
          <h1>{title}</h1>
          <span className="document-badge">本地文档</span>
        </div>
      </div>
      <div className="toolbar-actions">
        <span className="save-status" title={path ?? '尚未保存为本地文件'}>
          {dirty ? <span className="unsaved-dot" /> : <Check size={13} />}{' '}
          {busy ? '正在处理…' : dirty ? '未保存更改' : path ? '已保存' : '准备就绪'}
        </span>
        <ToolbarAction
          className="icon-button"
          label="新建导图"
          hint="新建导图 ⌘N"
          disabled={busy}
          onClick={newDocument}
        >
          <FilePlus2 size={17} />
        </ToolbarAction>
        <ToolbarAction
          className="icon-button"
          label="打开导图"
          hint="打开导图 ⌘O"
          disabled={busy}
          onClick={() => void openDocument()}
        >
          <FolderOpen size={17} />
        </ToolbarAction>
        <span className="toolbar-separator" />
        <ToolbarAction
          className="icon-button"
          label="撤销"
          hint="撤销 ⌘Z"
          disabled={history.past.length === 0 && !editingId}
          onClick={() => {
            useEditor.getState().undo()
          }}
        >
          <Undo2 size={17} />
        </ToolbarAction>
        <ToolbarAction
          className="icon-button"
          label="重做"
          hint="重做 ⇧⌘Z"
          disabled={history.future.length === 0}
          onClick={() => {
            useEditor.getState().redo()
          }}
        >
          <Redo2 size={17} />
        </ToolbarAction>
        <span className="toolbar-separator" />
        <ToolbarAction
          className={`icon-button ${outline ? 'active' : ''}`}
          label="文档大纲"
          aria-pressed={outline}
          hint="文档大纲"
          onClick={() => {
            useEditor.setState({ outlineOpen: !outline })
          }}
        >
          <ListTree size={18} />
        </ToolbarAction>
        <ToolbarAction
          className="icon-button"
          label="另存为"
          hint="另存为 ⇧⌘S"
          disabled={busy}
          onClick={() => void saveDocument(true)}
        >
          <Download size={16} />
        </ToolbarAction>
        <Button
          className="save-button"
          aria-label="保存导图"
          disabled={busy}
          onClick={() => void saveDocument()}
        >
          <Save size={15} /> 保存 <kbd>⌘ S</kbd>
        </Button>
      </div>
    </header>
  )
}
