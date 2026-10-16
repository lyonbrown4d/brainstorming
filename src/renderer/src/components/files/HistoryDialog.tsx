import { History } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { useFileDialogs, openHistoryDialog } from '../../state/fileDialogs'
import { useEditor } from '../../state/editor'
import { restoreBackup } from '../../state/files'

export function HistoryDialog() {
  return (
    <Button
      variant="ghost"
      size="sm"
      title="版本历史"
      onClick={() => {
        void openHistoryDialog()
      }}
    >
      <History className="size-4" />
      版本历史
    </Button>
  )
}
export function HistoryPanel() {
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
          <DialogTitle>版本历史</DialogTitle>
          <DialogDescription>
            成功保存后会保留本机最近 20
            份快照。恢复版本会先替换当前内容，直到下次保存才更新文件。已加密的历史版本保留保存时的密码。
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">正在读取版本…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {window.trelyx ? '尚无版本快照，请先保存文件。' : '版本历史由桌面版本地保存。'}
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
                    {backup.encrypted ? ' · 密码保护' : ''}
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
                  恢复
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
