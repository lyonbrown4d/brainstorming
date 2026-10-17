import { ChevronDown, Download, FilePlus2, FolderOpen, History, Save } from 'lucide-react'
import { useState } from 'react'
import { useRecentFiles } from '@renderer/hooks/useRecentFiles'
import { useEditor } from '@renderer/state/editor'
import { newDocument, openDocument, saveDocument } from '@renderer/state/files'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu'

const RecentFilesMenu = () => {
  const [open, setOpen] = useState(false)
  const recent = useRecentFiles(open)
  const busy = useEditor((state) => state.busy)
  return (
    <DropdownMenuSub onOpenChange={setOpen}>
      <DropdownMenuSubTrigger aria-label="最近文件" disabled={busy}>
        <History />
        最近文件
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          className="max-w-[min(320px,calc(100vw-24px))]"
          sideOffset={6}
          alignOffset={-6}
          aria-label="最近文件列表"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>最近文件</DropdownMenuLabel>
            {recent.isFetching && <DropdownMenuItem disabled>正在读取…</DropdownMenuItem>}
            {recent.isError && !recent.isFetching && (
              <DropdownMenuItem disabled>无法读取最近文件，请重新打开此菜单。</DropdownMenuItem>
            )}
            {recent.isSuccess &&
              !recent.isFetching &&
              (recent.data.length ? (
                recent.data.map((file) => (
                  <DropdownMenuItem
                    key={file.path}
                    title={file.path}
                    disabled={busy}
                    onSelect={() => void openDocument(file.path)}
                  >
                    <FolderOpen />
                    <span className="truncate">{file.name}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  {window.trelyx ? '还没有最近打开的文件。' : '桌面版会记住最近打开的文件。'}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

export const ToolbarFileMenu = () => {
  const title = useEditor((state) => state.workbook.title)
  const busy = useEditor((state) => state.busy)
  const filename = title.endsWith('.trelyx') ? title : `${title}.trelyx`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="document-menu-trigger min-w-0 shrink gap-1 px-1 sm:gap-2"
          aria-label="文件菜单"
          disabled={busy}
          title={filename}
        >
          <h1 className="truncate text-sm font-medium">{filename}</h1>
          <ChevronDown data-icon="inline-end" className="shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" sideOffset={10} aria-label="文件操作">
        <DropdownMenuGroup>
          <DropdownMenuLabel>文件</DropdownMenuLabel>
          <DropdownMenuItem disabled={busy} aria-label="新建导图" onSelect={newDocument}>
            <FilePlus2 />
            新建导图<DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            aria-label="打开导图"
            onSelect={() => void openDocument()}
          >
            <FolderOpen />
            打开导图<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <RecentFilesMenu />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={busy}
            aria-label="保存导图"
            onSelect={() => void saveDocument()}
          >
            <Save />
            保存导图<DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            aria-label="另存为"
            onSelect={() => void saveDocument(true)}
          >
            <Download />
            另存为<DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
