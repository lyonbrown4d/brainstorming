import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useMessages } from '@renderer/i18n/useMessages'

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
  const { translate } = useMessages()

  const [open, setOpen] = useState(false)
  const recent = useRecentFiles(open)
  const busy = useEditor((state) => state.busy)
  return (
    <DropdownMenuSub onOpenChange={setOpen}>
      <DropdownMenuSubTrigger aria-label={translate('recentFiles')} disabled={busy}>
        <History />
        {translate('recentFiles')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          className="max-w-[min(320px,calc(100vw-24px))]"
          sideOffset={6}
          alignOffset={-6}
          aria-label={translate('recentFileList')}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>{translate('recentFiles')}</DropdownMenuLabel>
            {recent.isFetching && (
              <DropdownMenuItem disabled>{translate('loading')}</DropdownMenuItem>
            )}
            {recent.isError && !recent.isFetching && (
              <DropdownMenuItem disabled>
                {translate('couldNotLoadRecentFilesReopenThis')}
              </DropdownMenuItem>
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
                <DropdownMenuItem disabled>{translate('noRecentlyOpenedFiles')}</DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

export const ToolbarFileMenu = () => {
  const mac = requireDesktopAPI().platform === 'macos'
  const { translate } = useMessages()

  const title = useEditor((state) => state.workbook.title)
  const busy = useEditor((state) => state.busy)
  const filename = title.endsWith('.brainstorming') ? title : `${title}.brainstorming`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="document-menu-trigger h-8 min-w-0 shrink gap-1 px-1 sm:gap-2"
          aria-label={translate('fileMenu')}
          disabled={busy}
          title={filename}
        >
          <h1 className="truncate text-sm font-medium">{filename}</h1>
          <ChevronDown data-icon="inline-end" className="shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align="start"
        sideOffset={10}
        aria-label={translate('fileActions')}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{translate('file')}</DropdownMenuLabel>
          <DropdownMenuItem disabled={busy} aria-label={translate('newMap')} onSelect={newDocument}>
            <FilePlus2 />
            {translate('newMap')}
            <DropdownMenuShortcut>{mac ? '⌘N' : 'Ctrl+N'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            aria-label={translate('openMap')}
            onSelect={() => void openDocument()}
          >
            <FolderOpen />
            {translate('openMap')}
            <DropdownMenuShortcut>{mac ? '⌘O' : 'Ctrl+O'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <RecentFilesMenu />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={busy}
            aria-label={translate('saveMap')}
            onSelect={() => void saveDocument()}
          >
            <Save />
            {translate('saveMap')}
            <DropdownMenuShortcut>{mac ? '⌘S' : 'Ctrl+S'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            aria-label={translate('saveAs')}
            onSelect={() => void saveDocument(true)}
          >
            <Download />
            {translate('saveAs')}
            <DropdownMenuShortcut>{mac ? '⇧⌘S' : 'Ctrl+Shift+S'}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
