import { useMessages } from '@renderer/i18n/useMessages'

import { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { FileSecurityPanel } from '@renderer/components/files/FileSecurity'
import { HistoryPanel } from '@renderer/components/files/HistoryDialog'
import { answerPassword, usePasswordPrompt } from '@renderer/state/password'

const PasswordForm = ({
  title,
  description,
  error,
}: {
  title: string
  description?: string
  error?: string
}) => {
  const { translate } = useMessages()

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
          {description ?? translate('thisFileIsPasswordProtectedThePassword')}
        </DialogDescription>
      </DialogHeader>
      <label htmlFor={passwordId} className="grid gap-2 text-sm">
        {translate('password')}
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
          {translate('cancel')}
        </Button>
        <Button type="submit" disabled={!password}>
          {translate('unlock')}
        </Button>
      </DialogFooter>
    </form>
  )
}
export const PasswordPrompt = () => {
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
