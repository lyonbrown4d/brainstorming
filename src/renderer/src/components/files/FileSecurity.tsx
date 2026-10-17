import { useMessages } from '@renderer/i18n/useMessages'

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
  const { translate } = useMessages()

  return (
    <Button
      variant="ghost"
      size="sm"
      title={translate('filePassword')}
      onClick={() => {
        useFileDialogs.setState({ security: true })
      }}
    >
      <LockKeyhole className="size-4" />
      {translate('filePassword')}
    </Button>
  )
}
export const FileSecurityPanel = () => {
  const { translate } = useMessages()

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
      setError(translate('enter8128CharactersAndMakeSureBoth'))
      return
    }
    setError(null)
    try {
      await changeFilePassword(value)
      setPassword('')
      setConfirmation('')
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate('couldNotUpdatePassword'))
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
            <DialogTitle>{translate('filePassword')}</DialogTitle>
            <DialogDescription>
              {encrypted
                ? translate('thisFileIsProtectedWithAes256Encryption')
                : translate('enablingAPasswordEncryptsTheFileRecovery')}
              {translate('keepYourPasswordSafeItIsStored')}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={passwordId} className="grid gap-2 text-sm">
            {encrypted ? translate('newPassword') : translate('password')}
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
            {translate('confirmPassword')}
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
              {translate('unlockSavedRecoveryData')}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {translate('existingRecoveryDataIsProtectedImmediatelySave')}
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
                {translate('removePassword')}
              </Button>
            )}
            <Button disabled={busy || !password || !confirmation} type="submit">
              {encrypted ? translate('changePassword') : translate('enablePassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
