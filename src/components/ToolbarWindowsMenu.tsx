import { useMutation, useQuery } from '@tanstack/react-query'
import { AppWindow, Check, FolderOpen, Plus } from 'lucide-react'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@renderer/components/ui/dropdown-menu'
import { useMessages } from '@renderer/i18n/useMessages'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { useEditor } from '@renderer/state/editor'

type WindowAction =
  { readonly type: 'new' | 'open' } | { readonly type: 'focus'; readonly id: string }

export const ToolbarWindowsMenu = ({ open }: { readonly open: boolean }) => {
  const api = getPlatformAPI()?.windows
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  const windows = useQuery(
    {
      queryKey: ['editor-windows'],
      queryFn: () => api?.listWindows() ?? Promise.resolve([]),
      enabled: open && api !== undefined,
      retry: false,
      staleTime: 0,
    },
    queryClient,
  )
  const action = useMutation(
    {
      mutationFn: async (operation: WindowAction) => {
        if (!api) return
        if (operation.type === 'focus') await api.focusWindow(operation.id)
        else if (operation.type === 'new') await api.newWindow()
        else await api.openDocumentInNewWindow()
      },
      onError: (error: unknown) => {
        useEditor.getState().setError(error instanceof Error ? error.message : String(error))
      },
    },
    queryClient,
  )
  if (!api) return null
  const disabled = busy || action.isPending
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{translate('windowActions')}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => {
            action.mutate({ type: 'new' })
          }}
        >
          <Plus />
          {translate('newWindow')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => {
            action.mutate({ type: 'open' })
          }}
        >
          <FolderOpen />
          {translate('openNewWindow')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {windows.isPending && (
          <DropdownMenuItem disabled>
            <LoadingIndicator />
            {translate('loading')}
          </DropdownMenuItem>
        )}
        {windows.isError && (
          <DropdownMenuItem disabled>{translate('windowListFailed')}</DropdownMenuItem>
        )}
        {windows.isSuccess && windows.data.length === 0 && (
          <DropdownMenuItem disabled>{translate('noOpenWindows')}</DropdownMenuItem>
        )}
        {windows.isSuccess &&
          windows.data.map((window) => (
            <DropdownMenuItem
              key={window.id}
              disabled={disabled || window.current}
              title={window.title}
              aria-label={
                window.current ? translate('currentWindow', { title: window.title }) : window.title
              }
              onSelect={() => {
                action.mutate({ type: 'focus', id: window.id })
              }}
            >
              <AppWindow />
              <span className="min-w-0 flex-1 truncate">{window.title}</span>
              {window.current && <Check aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
      </DropdownMenuGroup>
    </>
  )
}
