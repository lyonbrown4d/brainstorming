import { Search } from 'lucide-react'
import { useInRouterContext, useLocation } from 'react-router'
import { Button } from '@renderer/components/ui/button'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { commandPaletteCompositionActive, openCommandPalette } from '@renderer/state/commandPalette'

const PaletteButton = ({ pathname = '' }: { pathname?: string }) => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  const shortcut = requireDesktopAPI().platform === 'macos' ? '⌘K' : 'Ctrl+K'
  return (
    <Button
      variant="ghost"
      className="h-8 shrink-0 gap-2 rounded-md px-2 text-xs text-muted-foreground"
      aria-label={translate('commandPaletteTitle')}
      title={`${translate('commandPaletteTitle')} (${shortcut})`}
      aria-keyshortcuts="Meta+K Control+K"
      data-command-trigger
      disabled={busy || pathname === '/settings'}
      onPointerDown={(event) => {
        // Let Lexical finish the current composition before this button takes focus.
        if (commandPaletteCompositionActive()) event.preventDefault()
      }}
      onClick={(event) => openCommandPalette(pathname, event.currentTarget)}
    >
      <Search className="size-4" />
      <span className="hidden xl:inline">{translate('commandPaletteTitle')}</span>
      <kbd className="hidden text-[10px] text-muted-foreground/80 sm:inline">{shortcut}</kbd>
    </Button>
  )
}
const RoutedPaletteButton = () => <PaletteButton pathname={useLocation().pathname} />
export const CommandPaletteTrigger = () =>
  useInRouterContext() ? <RoutedPaletteButton /> : <PaletteButton />
