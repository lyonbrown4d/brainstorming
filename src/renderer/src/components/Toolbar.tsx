import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus2,
  FolderOpen,
  History,
  ListTree,
  Network,
  Save,
  SlidersHorizontal,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { useRecentFiles } from '../hooks/useRecentFiles'
import { useEditor, editorIsDirty } from '../state/editor'
import { newDocument, openDocument, saveDocument } from '../state/files'
import { Button } from './ui/button'
import { ViewModeSwitch } from './ViewModeSwitch'
import { useSpatialView } from '../state/spatial'
import { showWorkspaceHome } from '../state/creation'

function RecentFilesMenu() {
  const [open, setOpen] = useState(false)
  const recent = useRecentFiles(open)
  const busy = useEditor((state) => state.busy)
  return (
    <DropdownMenu.Sub onOpenChange={setOpen}>
      <DropdownMenu.SubTrigger className="control-menu-item" aria-label="最近文件">
        <History size={16} />
        最近文件
        <ChevronRight size={14} className="ml-auto" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          className="control-menu"
          sideOffset={6}
          alignOffset={-6}
          aria-label="最近文件列表"
        >
          <DropdownMenu.Label className="control-menu-label">最近文件</DropdownMenu.Label>
          {recent.isFetching && (
            <DropdownMenu.Item className="control-menu-item" disabled>
              正在读取…
            </DropdownMenu.Item>
          )}
          {recent.isError && !recent.isFetching && (
            <DropdownMenu.Item className="control-menu-item" disabled>
              无法读取最近文件，请重新打开此菜单。
            </DropdownMenu.Item>
          )}
          {recent.isSuccess &&
            !recent.isFetching &&
            (recent.data.length > 0 ? (
              recent.data.map((file) => (
                <DropdownMenu.Item
                  key={file.path}
                  className="control-menu-item"
                  title={file.path}
                  disabled={busy}
                  onSelect={() => void openDocument(file.path)}
                >
                  <FolderOpen size={16} />
                  {file.name}
                </DropdownMenu.Item>
              ))
            ) : (
              <DropdownMenu.Item className="control-menu-item" disabled>
                {window.trelyx ? '还没有最近打开的文件。' : '桌面版会记住最近打开的文件。'}
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  )
}

export function Toolbar() {
  const title = useEditor((state) => state.workbook.title)
  const path = useEditor((state) => state.path)
  const busy = useEditor((state) => state.busy)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const dirty = useEditor(editorIsDirty)
  const sheetId = useEditor((state) => state.activeSheetId)
  const spatial = useSpatialView((state) => state.sheets[sheetId]?.mode === '3d')
  return (
    <header className="toolbar relative">
      <div className="toolbar-identity">
        <Button
          variant="ghost"
          className="toolbar-brand"
          aria-label="返回首页"
          disabled={busy}
          onClick={showWorkspaceHome}
        >
          <Network size={25} strokeWidth={1.7} />
          <span>Trelyx</span>
        </Button>
        <span className="toolbar-separator" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              className="document-menu-trigger"
              aria-label="文件菜单"
              disabled={busy}
            >
              <h1>{title.endsWith('.trelyx') ? title : `${title}.trelyx`}</h1>
              <ChevronDown size={14} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="control-menu" align="start" sideOffset={10}>
              <DropdownMenu.Label className="control-menu-label">文件</DropdownMenu.Label>
              <DropdownMenu.Item
                className="control-menu-item"
                aria-label="新建导图"
                onSelect={newDocument}
              >
                <FilePlus2 size={16} />
                新建导图<kbd>⌘N</kbd>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="control-menu-item"
                aria-label="打开导图"
                onSelect={() => void openDocument()}
              >
                <FolderOpen size={16} />
                打开导图<kbd>⌘O</kbd>
              </DropdownMenu.Item>
              <RecentFilesMenu />
              <DropdownMenu.Separator className="control-menu-separator" />
              <DropdownMenu.Item
                className="control-menu-item"
                aria-label="保存导图"
                onSelect={() => void saveDocument()}
              >
                <Save size={16} />
                保存导图<kbd>⌘S</kbd>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="control-menu-item"
                aria-label="另存为"
                onSelect={() => void saveDocument(true)}
              >
                <Download size={16} />
                另存为<kbd>⇧⌘S</kbd>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="save-status" title={path ?? '尚未保存为本地文件'} aria-live="polite">
          {dirty ? <span className="unsaved-dot" /> : <Check size={14} />}
          {busy ? '正在处理…' : dirty ? '未保存' : path ? '已保存' : '本地草稿'}
        </span>
      </div>
      <ViewModeSwitch />
      <div className="toolbar-actions">
        <Button
          variant="ghost"
          className="panel-toggle"
          aria-label="文档大纲"
          aria-pressed={outline}
          onClick={() => {
            useEditor.setState({ outlineOpen: !outline })
          }}
        >
          <ListTree size={20} />
          <span>大纲</span>
        </Button>
        <span className="toolbar-separator" />
        <Button
          variant="ghost"
          className="panel-toggle"
          aria-label={spatial ? '主题面板' : '样式面板'}
          aria-pressed={inspector}
          onClick={() => {
            useEditor.setState({ inspectorOpen: !inspector })
          }}
        >
          <SlidersHorizontal size={20} />
          <span>{spatial ? '主题' : '样式'}</span>
        </Button>
      </div>
    </header>
  )
}
