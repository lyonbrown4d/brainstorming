import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, AppWindow } from 'lucide-react'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@renderer/components/ui/dropdown-menu'
import { moveDocumentToWindow } from '@renderer/state/windowTransfers'
import { useEditor } from '@renderer/state/editor'

export const DocumentWindowMenu = ({ tabId }: { readonly tabId?: string }) => {
  const { translate } = useMessages()
  const api = getPlatformAPI()?.windows
  const [open, setOpen] = useState(false)
  const busy = useEditor((state) => state.busy)
  const windows = useQuery({
    queryKey: ['editor-windows'],
    queryFn: () => api?.listWindows() ?? Promise.resolve([]),
    enabled: open && api !== undefined,
    staleTime: 0,
  })
  if (!api) return null
  const run = (operation: Promise<unknown>): void => {
    void operation.catch((error: unknown) => {
      useEditor.getState().setError(error instanceof Error ? error.message : String(error))
    })
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 rounded-md text-muted-foreground"
          disabled={busy}
          aria-label={translate('windowActions')}
        >
          <AppWindow className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-72">
        <DropdownMenuItem
          onSelect={() => {
            run(api.newWindow())
          }}
        >
          {translate('newWindow')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            run(api.openDocumentInNewWindow())
          }}
        >
          {translate('openNewWindow')}
        </DropdownMenuItem>
        {tabId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                run(moveDocumentToWindow(tabId))
              }}
            >
              <ArrowUpRight />
              {translate('moveMapNewWindow')}
            </DropdownMenuItem>
            {windows.isPending && (
              <DropdownMenuItem disabled>{translate('loading')}</DropdownMenuItem>
            )}
            {windows.isError && (
              <DropdownMenuItem disabled>{translate('windowListFailed')}</DropdownMenuItem>
            )}
            {windows.data
              ?.filter((window) => !window.current)
              .map((window) => (
                <DropdownMenuItem
                  key={window.id}
                  onSelect={() => {
                    run(moveDocumentToWindow(tabId, window.id))
                  }}
                >
                  <span className="truncate">
                    {translate('moveMapToWindow', { title: window.title })}
                  </span>
                </DropdownMenuItem>
              ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
