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
import { useRef, useState } from 'react'
import type { RecentFile } from '@shared/contracts'
import { useEditor, editorIsDirty } from '../state/editor'
import { newDocument, openDocument, saveDocument } from '../state/files'
import { Button } from './ui/button'

type RecentFilesState =
  { status: 'loading' } | { status: 'ready'; files: readonly RecentFile[] } | { status: 'error' }

function RecentFilesMenu() {
  const [recent, setRecent] = useState<RecentFilesState>({ status: 'ready', files: [] })
  const request = useRef(0)
  const busy = useEditor((state) => state.busy)
  const load = (open: boolean): void => {
    const currentRequest = ++request.current
    if (!open) return
    const bridge = window.trelyx
    if (!bridge) {
      setRecent({ status: 'ready', files: [] })
      return
    }
    setRecent({ status: 'loading' })
    void bridge.getRecentFiles().then(
      (files) => {
        if (request.current === currentRequest) setRecent({ status: 'ready', files })
      },
      () => {
        if (request.current === currentRequest) setRecent({ status: 'error' })
      },
    )
  }
  return (
    <DropdownMenu.Sub onOpenChange={load}>
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
          {recent.status === 'loading' && (
            <DropdownMenu.Item className="control-menu-item" disabled>
              正在读取…
            </DropdownMenu.Item>
          )}
          {recent.status === 'error' && (
            <DropdownMenu.Item className="control-menu-item" disabled>
              无法读取最近文件，请重新打开此菜单。
            </DropdownMenu.Item>
          )}
          {recent.status === 'ready' &&
            (recent.files.length > 0 ? (
              recent.files.map((file) => (
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
  return (
    <header className="toolbar">
      <div className="toolbar-identity">
        <div className="toolbar-brand">
          <Network size={25} strokeWidth={1.7} />
          <span>Trelyx</span>
        </div>
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
          aria-label="样式面板"
          aria-pressed={inspector}
          onClick={() => {
            useEditor.setState({ inspectorOpen: !inspector })
          }}
        >
          <SlidersHorizontal size={20} />
          <span>样式</span>
        </Button>
      </div>
    </header>
  )
}
