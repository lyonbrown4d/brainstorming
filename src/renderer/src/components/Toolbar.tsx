import { useMessages } from '@renderer/i18n/useMessages'

import { LanguageMenu } from '@renderer/components/LanguageMenu'
import { AppAppearance } from '@renderer/components/appearance/AppAppearance'
import { PresentationLauncher } from '@renderer/components/documents/PresentationLauncher'
import { Check, ListTree, Network, SlidersHorizontal } from 'lucide-react'
import { useEditor, editorIsDirty } from '@renderer/state/editor'
import { showWorkspaceHome } from '@renderer/state/creation'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { ToolbarFileMenu } from '@renderer/components/ToolbarFileMenu'
import { ViewModeSwitch } from '@renderer/components/ViewModeSwitch'

export const Toolbar = () => {
  const { translate } = useMessages()

  const path = useEditor((state) => state.path)
  const busy = useEditor((state) => state.busy)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const dirty = useEditor(editorIsDirty)
  return (
    <header className="toolbar relative z-10 grid h-14 min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background px-3 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 xl:gap-4">
        <Button
          variant="ghost"
          className="shrink-0 gap-2 px-0 text-xl font-semibold tracking-tight"
          aria-label={translate('returnToHome')}
          disabled={busy}
          onClick={showWorkspaceHome}
        >
          <Network data-icon="inline-start" className="text-primary" strokeWidth={1.7} />
          <span className="hidden min-[1100px]:inline">Trelyx</span>
        </Button>
        <Separator
          orientation="vertical"
          className="hidden data-[orientation=vertical]:h-5 min-[720px]:block"
        />
        <ToolbarFileMenu />
        <span
          className="save-status hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground min-[1280px]:inline-flex"
          title={path ?? translate('notSavedToALocalFile')}
          aria-live="polite"
        >
          {dirty ? (
            <span className="size-1.5 rounded-full bg-primary" />
          ) : (
            <Check className="size-3.5" />
          )}
          {busy
            ? translate('processing')
            : dirty
              ? translate('unsaved')
              : path
                ? translate('saved')
                : translate('localDraft')}
        </span>
      </div>
      <ViewModeSwitch />
      <div className="toolbar-actions flex shrink-0 items-center justify-end gap-1">
        <PresentationLauncher />
        <LanguageMenu />
        <AppAppearance />
        <Button
          variant="ghost"
          className="h-8 gap-2 px-2 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={translate('documentOutline')}
          aria-pressed={outline}
          title={translate('documentOutline')}
          onClick={() => {
            useEditor.setState({ outlineOpen: !outline })
          }}
        >
          <ListTree data-icon="inline-start" />
          <span className="hidden min-[720px]:inline">{translate('outline')}</span>
        </Button>
        <Separator
          orientation="vertical"
          className="mx-1 hidden data-[orientation=vertical]:h-5 min-[720px]:block"
        />
        <Button
          variant="ghost"
          className="h-8 gap-2 px-2 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={translate('propertiesPanel')}
          aria-pressed={inspector}
          title={translate('propertiesPanel')}
          onClick={() => {
            useEditor.setState({ inspectorOpen: !inspector })
          }}
        >
          <SlidersHorizontal data-icon="inline-start" />
          <span className="hidden min-[720px]:inline">{translate('properties')}</span>
        </Button>
      </div>
    </header>
  )
}
