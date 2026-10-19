import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useMessages } from '@renderer/i18n/useMessages'

import { History } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { useFileDialogs, openHistoryDialog } from '@renderer/state/fileDialogs'
import { useEditor } from '@renderer/state/editor'
import { restoreBackup } from '@renderer/state/files'

export const HistoryDialog = () => {
  const { translate } = useMessages()

  return (
    <Button
      variant="ghost"
      size="sm"
      title={translate('versionHistory')}
      onClick={() => {
        void openHistoryDialog()
      }}
    >
      <History className="size-4" />
      {translate('versionHistory')}
    </Button>
  )
}
export const HistoryPanel = () => {
  const { translate } = useMessages()

  const open = useFileDialogs((state) => state.history)
  const setOpen = (value: boolean): void => {
    useFileDialogs.setState({ history: value })
  }
  const loading = useFileDialogs((state) => state.historyLoading)
  const error = useFileDialogs((state) => state.historyError)
  const backups = useFileDialogs((state) => state.backups)
  const busy = useEditor((state) => state.busy)
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('versionHistory')}</DialogTitle>
          <DialogDescription>{translate('theLast20SavedSnapshotsAreKept')}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <LoadingState label={translate('loadingVersions')} />
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate('noVersionSnapshotsSaveTheFileFirst')}
          </p>
        ) : (
          <ul className="grid max-h-80 gap-2 overflow-y-auto">
            {backups.map((backup) => (
              <li
                key={backup.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0 text-sm">
                  <p>{new Date(backup.createdAt).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.max(1, Math.round(backup.size / 1024))} KiB
                    {backup.encrypted ? translate('passwordProtected') : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    void restoreBackup(backup.id)
                  }}
                >
                  {translate('restore')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
