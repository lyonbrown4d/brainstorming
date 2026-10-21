import { SpatialModeSwitch } from '@renderer/components/spatial/SpatialModeSwitch'
import { CommandPaletteTrigger } from '@renderer/components/commands/CommandPaletteTrigger'
import { closeInspector, toggleInspector } from '@renderer/state/inspectorNavigation'
import { BrandLogo } from '@renderer/components/BrandLogo'
import { WindowTitlebar } from '@renderer/components/WindowTitlebar'
import { WindowControls } from '@renderer/components/WindowControls'
import { useMessages } from '@renderer/i18n/useMessages'

import { SettingsButton } from '@renderer/components/settings/SettingsButton'
import { PresentationLauncher } from '@renderer/components/documents/PresentationLauncher'
import { Check, ListTree, SlidersHorizontal } from 'lucide-react'
import { useEditor, editorIsDirty } from '@renderer/state/editor'
import { showWorkspaceHome } from '@renderer/state/creation'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { ToolbarFileMenu } from '@renderer/components/ToolbarFileMenu'

export const Toolbar = () => {
  const { translate } = useMessages()

  const path = useEditor((state) => state.path)
  const busy = useEditor((state) => state.busy)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const dirty = useEditor(editorIsDirty)
  return (
    <WindowTitlebar className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 !px-0">
      <div className="flex min-w-0 items-center gap-2 ml-3 sm:ml-4 xl:gap-3 group-data-[platform=macos]/shell:ml-28 group-data-[platform=macos]/shell:group-data-[fullscreen=true]/shell:ml-5">
        <Button
          variant="ghost"
          className="size-8 shrink-0 rounded-md p-0"
          aria-label={translate('returnToHome')}
          disabled={busy}
          onClick={showWorkspaceHome}
        >
          <BrandLogo className="size-6" />
        </Button>
        <Separator
          orientation="vertical"
          className="hidden data-[orientation=vertical]:h-5 min-[720px]:block"
        />
        <ToolbarFileMenu />
        <span
          className="save-status hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground min-[1100px]:inline-flex"
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
      <SpatialModeSwitch />
      <div className="toolbar-actions flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-x-auto pr-3 sm:pr-4 group-data-[platform=windows]/shell:pr-32 group-data-[platform=linux]/shell:pr-32">
        <PresentationLauncher />
        <CommandPaletteTrigger />
        <SettingsButton />
        <Button
          variant="ghost"
          className="h-8 gap-1.5 rounded-md px-2 text-xs text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={translate('documentOutline')}
          aria-pressed={outline}
          title={translate('documentOutline')}
          onClick={() => {
            if (window.matchMedia('(max-width: 767px)').matches && !outline && inspector) {
              closeInspector()
              if (useEditor.getState().inspectorOpen) return
            }
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
          className="h-8 gap-1.5 rounded-md px-2 text-xs text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={translate('propertiesPanel')}
          aria-pressed={inspector}
          title={translate('propertiesPanel')}
          onClick={toggleInspector}
        >
          <SlidersHorizontal data-icon="inline-start" />
          <span className="hidden min-[720px]:inline">{translate('properties')}</span>
        </Button>
      </div>
      <WindowControls />
    </WindowTitlebar>
  )
}
