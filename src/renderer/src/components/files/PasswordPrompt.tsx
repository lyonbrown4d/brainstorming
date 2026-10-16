import { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { FileSecurityPanel } from './FileSecurity'
import { HistoryPanel } from './HistoryDialog'
import { answerPassword, usePasswordPrompt } from '../../state/password'

function PasswordForm({
  title,
  description,
  error,
}: {
  title: string
  description?: string
  error?: string
}) {
  const [password, setPassword] = useState('')
  const passwordId = useId()
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!password) return
        answerPassword(password)
        setPassword('')
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {description ?? '此文件使用密码保护。密码仅在当前会话中保留。'}
        </DialogDescription>
      </DialogHeader>
      <label htmlFor={passwordId} className="grid gap-2 text-sm">
        密码
        <Input
          id={passwordId}
          type="password"
          value={password}
          autoComplete="current-password"
          maxLength={1024}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            answerPassword(null)
          }}
        >
          取消
        </Button>
        <Button type="submit" disabled={!password}>
          解锁
        </Button>
      </DialogFooter>
    </form>
  )
}
export function PasswordPrompt() {
  const request = usePasswordPrompt((state) => state.request)
  return (
    <>
      <FileSecurityPanel />
      <HistoryPanel />
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) answerPassword(null)
        }}
      >
        {request && (
          <DialogContent>
            <PasswordForm
              key={request.id}
              title={request.title}
              {...(request.description === undefined ? {} : { description: request.description })}
              {...(request.error === undefined ? {} : { error: request.error })}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
