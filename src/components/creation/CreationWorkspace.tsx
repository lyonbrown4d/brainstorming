import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { openDocument, retryRecovery } from '@renderer/state/files'
import { useFileSecurityState } from '@renderer/state/password'
import {
  beginCreation,
  cancelCreation,
  createFromRequest,
  exploreExample,
} from '@renderer/state/creation'
import { enterWorkspaceEditor, updateCreationDraft, useWorkspace } from '@renderer/state/workspace'
import { Button } from '@renderer/components/ui/button'
import { CreationGallery } from '@renderer/components/creation/CreationGallery'
import { CreationHeader } from '@renderer/components/creation/CreationHeader'
import { RecentDocuments } from '@renderer/components/creation/RecentDocuments'

export const WorkspaceHeader = () => {
  const { translate } = useMessages()

  const screen = useWorkspace((state) => state.screen)
  const hasDocument = useWorkspace((state) => state.hasDocument)
  const busy = useEditor((state) => state.busy)
  return (
    <CreationHeader
      busy={busy}
      {...(screen === 'home' ? { onOpen: () => void openDocument() } : {})}
      {...(screen !== 'home' || hasDocument
        ? {
            onCancel: () => {
              if (screen === 'home') enterWorkspaceEditor()
              else cancelCreation()
            },
            cancelLabel: hasDocument ? translate('returnToCanvas') : translate('returnToHome'),
          }
        : {})}
    />
  )
}

export const CreationWorkspace = () => {
  const { translate } = useMessages()

  const screen = useWorkspace((state) => state.screen)
  const step = useWorkspace((state) => state.creationStep)
  const busy = useEditor((state) => state.busy)
  const error = useEditor((state) => state.error)
  const lockedRecovery = useFileSecurityState((state) => state.lockedRecovery)
  const home = screen === 'home'
  const mode = screen === 'create-sheet' ? 'sheet' : 'document'
  const draft = useWorkspace((state) => state.creationDrafts[mode])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {lockedRecovery && (
        <div className="border-b border-border bg-background px-5 py-2 sm:px-10">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void retryRecovery()}>
            {translate('unlockRecoveryData')}
          </Button>
        </div>
      )}
      <CreationGallery
        key={screen === 'create-sheet' ? 'sheet' : 'document'}
        mode={mode}
        draft={draft}
        onDraftChange={(draft) => {
          updateCreationDraft(mode, draft)
        }}
        busy={busy}
        error={error}
        step={step}
        onStepChange={(next) => {
          if (home && !beginCreation('document')) return
          useWorkspace.setState({ creationStep: next })
        }}
        showHeader={false}
        onCreate={(request) => {
          if (home) {
            if (!beginCreation('document')) return false
            useWorkspace.setState({ creationStep: 2 })
          }
          return createFromRequest(request)
        }}
        {...(home
          ? {
              sidebar: (
                <RecentDocuments
                  busy={busy}
                  onExample={() => {
                    exploreExample()
                  }}
                />
              ),
            }
          : {})}
      />
    </div>
  )
}
