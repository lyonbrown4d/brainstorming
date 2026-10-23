import { CommandPalette } from '@renderer/components/commands/CommandPalette'
import { CreationWorkspace, WorkspaceHeader } from '@renderer/components/creation/CreationWorkspace'
import { DocumentTabs } from '@renderer/components/DocumentTabs'
import { EditorWorkspace } from '@renderer/components/application/EditorWorkspace'
import { WorkspaceNotices } from '@renderer/components/application/WorkspaceNotices'
import { FileDropOverlay } from '@renderer/components/FileDropOverlay'
import { Toolbar } from '@renderer/components/Toolbar'
import { useApplicationServices } from '@renderer/hooks/useApplicationServices'
import { useFileDrop } from '@renderer/hooks/useFileDrop'
import { useWindowChrome } from '@renderer/hooks/useWindowChrome'
import { SettingsRoute } from '@renderer/routing/SettingsRoute'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'

export const ApplicationShell = () => {
  useApplicationServices()
  const fileDrop = useFileDrop()
  const chrome = useWindowChrome()
  const playing = usePresentation((state) => state.playing)
  const screen = useWorkspace((state) => state.screen)
  const activeTabId = useDocumentTabs((state) => state.activeId)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  return (
    <div
      className="app-shell group/shell relative flex h-full bg-canvas text-foreground w-full min-w-0 flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      {...fileDrop.handlers}
      data-platform={chrome.platform}
      data-focused={chrome.focused}
      data-fullscreen={chrome.fullScreen}
    >
      <FileDropOverlay {...fileDrop} />
      <SettingsRoute />
      <CommandPalette />
      {!playing && (screen === 'editor' ? <Toolbar /> : <WorkspaceHeader />)}
      <div className="app-body relative flex min-h-0 flex-1">
        <main className="workspace-main relative flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspaceNotices />
          {screen === 'editor' ? (
            <EditorWorkspace key={`${activeTabId}:${activeSheetId}`} />
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <DocumentTabs />
              <CreationWorkspace />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
