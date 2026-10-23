import { X } from 'lucide-react'
import { ImportNotice } from '@renderer/components/ImportNotice'
import { SearchPanel } from '@renderer/components/SearchPanel'
import { PasswordPrompt } from '@renderer/components/files/PasswordPrompt'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import {
  dismissWorkspaceRecovery,
  restoreWorkspaceRecovery,
} from '@renderer/state/documentRecovery'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'

export const WorkspaceNotices = () => {
  const { translate } = useMessages()
  const recovery = useDocumentTabs((state) => state.recovery)
  const error = useEditor((state) => state.error)
  const screen = useWorkspace((state) => state.screen)
  const playing = usePresentation((state) => state.playing)
  return (
    <>
      {recovery.length > 0 && (
        <div
          className="recovery-banner z-[9] flex items-center gap-[15px] border-b border-border bg-accent px-6 py-2.5 text-[13px] text-accent-foreground [&>button]:text-xs"
          role="status"
        >
          <span className="flex-1">{translate('workspaceRecoveryFound')}</span>
          <Button variant="ghost" size="sm" onClick={() => void restoreWorkspaceRecovery()}>
            {translate('restoreMaps', { count: recovery.length })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void dismissWorkspaceRecovery()}>
            {translate('dismissRecovery')}
          </Button>
        </div>
      )}
      {error && screen === 'editor' && (
        <div
          className="error-banner z-[9] flex items-center gap-[15px] bg-background px-6 py-2.5 text-[13px] text-destructive"
          role="alert"
        >
          <span className="flex-1">{error}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={translate('dismissError')}
            onClick={() => {
              useEditor.getState().setError(null)
            }}
          >
            <X size={15} />
          </Button>
        </div>
      )}
      <ImportNotice />
      {screen === 'editor' && !playing && <SearchPanel />}
      <PasswordPrompt />
    </>
  )
}
