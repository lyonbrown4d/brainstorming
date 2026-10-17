import { useId, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { useEditor } from '@renderer/state/editor'
import { changeFilePassword, retryRecovery } from '@renderer/state/files'
import { useFileDialogs } from '@renderer/state/fileDialogs'
import { useFileSecurityState } from '@renderer/state/password'

export const FileSecurity = () => {
  return (
    <Button
      variant="ghost"
      size="sm"
      title="文件密码"
      onClick={() => {
        useFileDialogs.setState({ security: true })
      }}
    >
      <LockKeyhole className="size-4" />
      文件密码
    </Button>
  )
}
export const FileSecurityPanel = () => {
  const open = useFileDialogs((state) => state.security)
  const setOpen = (value: boolean): void => {
    useFileDialogs.setState({ security: value })
  }
  const passwordId = useId()
  const confirmationId = useId()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const documentId = useEditor((state) => state.workbook.id)
  const busy = useEditor((state) => state.busy)
  const security = useFileSecurityState()
  const encrypted = security.documentId === documentId && security.encrypted
  const apply = async (value: string | null): Promise<void> => {
    if (busy) return
    if (value !== null && (value.length < 8 || value.length > 128 || value !== confirmation)) {
      setError('请输入 8 至 128 个字符的密码，并确保两次输入相同。')
      return
    }
    setError(null)
    try {
      await changeFilePassword(value)
      setPassword('')
      setConfirmation('')
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '密码设置失败')
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) {
          setPassword('')
          setConfirmation('')
          setError(null)
        }
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void apply(password)
          }}
        >
          <DialogHeader>
            <DialogTitle>文件密码</DialogTitle>
            <DialogDescription>
              {encrypted
                ? '当前文件已启用 AES-256 密码保护。'
                : '启用密码后，文件、自动恢复和版本快照都将加密。'}
              密码仅保留在当前会话中，请妥善保存；忘记后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={passwordId} className="grid gap-2 text-sm">
            {encrypted ? '新密码' : '密码'}
            <Input
              id={passwordId}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
              required
            />
          </label>
          <label htmlFor={confirmationId} className="grid gap-2 text-sm">
            确认密码
            <Input
              id={confirmationId}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value)
              }}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {security.lockedRecovery && (
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                void retryRecovery()
              }}
            >
              解锁已保留的自动恢复记录
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            设置会立即保护现有恢复记录；请保存文件以完成磁盘文件更新。
          </p>
          <DialogFooter>
            {encrypted && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void apply(null)
                }}
              >
                移除密码
              </Button>
            )}
            <Button disabled={busy || !password || !confirmation} type="submit">
              {encrypted ? '更改密码' : '启用密码'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
