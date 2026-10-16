import { ArrowLeft, Network } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { openDocument, retryRecovery } from '../../state/files'
import { useFileSecurityState } from '../../state/password'
import {
  beginCreation,
  cancelCreation,
  createFromRequest,
  exploreExample,
} from '../../state/creation'
import { enterWorkspaceEditor, useWorkspace } from '../../state/workspace'
import { Button } from '../ui/button'
import { CreationGallery } from './CreationGallery'
import { RecentDocuments } from './RecentDocuments'

export function WorkspaceHeader() {
  const screen = useWorkspace((state) => state.screen)
  return (
    <header className="toolbar">
      <div className="flex items-center gap-3 text-primary">
        <Network className="size-6" />
        <span className="text-lg font-semibold">Trelyx</span>
        <span className="text-xs font-normal text-muted-foreground">
          {screen === 'home' ? '首页' : screen === 'create-sheet' ? '新建画布' : '新建文档'}
        </span>
      </div>
    </header>
  )
}

export function CreationWorkspace() {
  const screen = useWorkspace((state) => state.screen)
  const hasDocument = useWorkspace((state) => state.hasDocument)
  const busy = useEditor((state) => state.busy)
  const error = useEditor((state) => state.error)
  const lockedRecovery = useFileSecurityState((state) => state.lockedRecovery)
  const home = screen === 'home'
  const cancel = () => {
    if (home) enterWorkspaceEditor()
    else cancelCreation()
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25">
      {lockedRecovery && (
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-8 pt-5">
          <span className="text-sm text-muted-foreground">加密恢复记录已保留。</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void retryRecovery()}>
            重新解锁恢复记录
          </Button>
        </div>
      )}
      {home && hasDocument && (
        <div className="mx-auto max-w-7xl px-8 pt-4">
          <Button variant="ghost" disabled={busy} onClick={cancel}>
            <ArrowLeft className="size-4" />
            返回画布
          </Button>
        </div>
      )}
      <div className="mx-auto flex max-w-[1600px] flex-col xl:flex-row">
        <div className="min-w-0 flex-1 [&>section]:h-auto [&>section]:overflow-visible">
          <CreationGallery
            key={screen === 'create-sheet' ? 'sheet' : 'document'}
            mode={screen === 'create-sheet' ? 'sheet' : 'document'}
            busy={busy}
            error={error}
            cancelLabel={hasDocument ? '返回画布' : '返回首页'}
            onCreate={(request) => {
              if (home && !beginCreation('document')) return false
              return createFromRequest(request)
            }}
            {...(!home ? { onCancel: cancel } : {})}
            {...(home
              ? {
                  onOpen: () => void openDocument(),
                  onExample: () => {
                    exploreExample()
                  },
                }
              : {})}
          />
        </div>
        {home && <RecentDocuments busy={busy} />}
      </div>
    </div>
  )
}
