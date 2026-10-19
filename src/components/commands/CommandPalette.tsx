import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { defaultFilter } from 'cmdk'
import { useMessages } from '@renderer/i18n/useMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useCommandPalette } from '@renderer/hooks/useCommandPalette'
import { useCommandPaletteContent } from '@renderer/hooks/useCommandPaletteContent'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@renderer/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { CommandContentResults } from '@renderer/components/commands/CommandContentResults'
import { paletteCommands, runPaletteCommand } from '@renderer/components/commands/paletteCommands'
import { closeCommandPalette, useCommandPaletteState } from '@renderer/state/commandPalette'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'
import { usePasswordPrompt } from '@renderer/state/password'
import { isCompositionKey } from '@renderer/state/keyboard'
import { useShortcutPreferences } from '@renderer/state/shortcutPreferences'
import { commitWorkspaceNavigation } from '@renderer/routing/workspaceNavigation'

export const CommandPalette = () => {
  useCommandPalette()
  const { translate } = useMessages()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const open = useCommandPaletteState((state) => state.open)
  const [query, setQuery] = useState('')
  const shortcutOverrides = useShortcutPreferences((state) => state.overrides)
  const pendingAction = useRef<(() => void) | null>(null)
  // Subscribe only to availability inputs, never to topic content or editor drafts.
  const [busy] = useEditor(
    useShallow(
      (state) =>
        [
          state.busy,
          state.history.past.length,
          state.history.future.length,
          state.structurePast.length,
          state.structureFuture.length,
        ] as const,
    ),
  )
  useWorkspace(useShallow((state) => [state.screen, state.hasDocument]))
  const playing = usePresentation((state) => state.playing)
  usePresentation((state) => state.workspaceMode)
  const password = usePasswordPrompt((state) => state.request)
  const blocked = pathname === '/settings' || playing || password !== null
  const content = useCommandPaletteContent(query, open && !blocked)
  useEffect(() => {
    if (blocked) {
      pendingAction.current = null
      closeCommandPalette()
    }
  }, [blocked])
  const commands = paletteCommands(
    requireDesktopAPI().platform === 'macos' ? '⌘' : 'Ctrl+',
    () => {
      if (commitWorkspaceNavigation())
        void navigate('/settings', { state: { settingsReturnTo: pathname } })
    },
    shortcutOverrides,
  )
  const groups = [...new Set(commands.map((command) => command.group))]
  const select = (operation: () => void): void => {
    pendingAction.current = operation
    closeCommandPalette()
  }
  return (
    <Dialog
      open={open && !blocked}
      onOpenChange={(next) => {
        if (!next) closeCommandPalette()
      }}
    >
      <DialogContent
        data-command-palette
        className="top-[min(22vh,10rem)] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-xl sm:max-w-[540px]"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (isCompositionKey(event)) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const { returnFocus } = useCommandPaletteState.getState()
          const fallback = document.querySelector<HTMLElement>('[data-command-trigger]')
          ;(returnFocus?.isConnected ? returnFocus : fallback)?.focus({ preventScroll: true })
          const operation = pendingAction.current
          pendingAction.current = null
          setQuery('')
          if (operation) queueMicrotask(operation)
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{translate('commandPaletteTitle')}</DialogTitle>
          <DialogDescription>{translate('commandPalettePlaceholder')}</DialogDescription>
        </DialogHeader>
        <Command
          label={translate('commandPaletteTitle')}
          className="[&_[data-slot=command-input-wrapper]]:h-12"
          loop
          filter={(value, search, keywords) =>
            value.startsWith('content:') ? 1 : defaultFilter(value, search, keywords)
          }
          onKeyDownCapture={(event) => {
            if (isCompositionKey(event.nativeEvent)) event.stopPropagation()
          }}
        >
          <CommandInput
            aria-label={translate('commandPaletteTitle')}
            placeholder={translate('commandPalettePlaceholder')}
            value={query}
            onValueChange={setQuery}
            className="h-12 text-[13px]"
          />
          <CommandList className="max-h-[min(55vh,430px)] p-1.5" aria-busy={busy}>
            {!content.pending && !content.error && content.results.length === 0 && (
              <CommandEmpty>{translate('commandPaletteEmpty')}</CommandEmpty>
            )}
            {groups.map((group, index) => (
              <div key={group}>
                {index > 0 && <CommandSeparator className="my-1" />}
                <CommandGroup heading={translate(group)}>
                  {commands
                    .filter((command) => command.group === group)
                    .map((command) => (
                      <CommandItem
                        key={command.id}
                        value={`${command.id} ${translate(command.label)}`}
                        keywords={command.keywords}
                        disabled={!command.enabled()}
                        onSelect={() => {
                          select(() => {
                            runPaletteCommand(command)
                          })
                        }}
                        className="gap-3 px-2 py-2 text-[13px]"
                      >
                        <command.icon className="size-4" />
                        <span>{translate(command.label)}</span>
                        {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </div>
            ))}
            <CommandSeparator className="my-1" />
            <CommandContentResults
              query={query}
              {...content}
              disabled={busy || blocked}
              select={select}
            />
          </CommandList>
        </Command>
        <div className="border-t bg-muted/30 px-4 py-2.5 text-[10px] text-muted-foreground">
          {translate('commandPaletteHint')}
        </div>
      </DialogContent>
    </Dialog>
  )
}
