import { useMessages } from '@renderer/i18n/useMessages'

import { DialogContent } from '@renderer/components/DialogContent'
import { useId, useRef, useState } from 'react'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'

export interface SheetDialogAction {
  kind: 'rename' | 'delete'
  id: string
  name: string
}

export const SheetDialog = ({
  action,
  busy,
  onClose,
}: {
  action: SheetDialogAction
  busy: boolean
  onClose: () => void
}) => {
  const { translate } = useMessages()

  const [name, setName] = useState(action.name)
  const nameId = useId()
  const submitting = useRef(false)
  const composing = useRef(false)
  const rename = action.kind === 'rename'
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rename ? translate('renameSheet') : translate('deleteSheet')}</DialogTitle>
          <DialogDescription>
            {rename
              ? translate('theSheetNameIsUsedInThe')
              : translate('deleteValue0AndAllItsTopics', { value0: action.name })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy || submitting.current || composing.current || (rename && !name.trim())) return
            submitting.current = true
            if (rename) useEditor.getState().renameSheet(action.id, name.trim())
            else useEditor.getState().deleteSheet(action.id)
            onClose()
          }}
        >
          {rename && (
            <Label className="grid items-stretch gap-2.5 text-[13px]" htmlFor={nameId}>
              {translate('sheetName')}
              <Input
                id={nameId}
                value={name}
                maxLength={80}
                required
                onChange={(event) => {
                  setName(event.target.value)
                }}
                onCompositionStart={() => {
                  composing.current = true
                }}
                onCompositionEnd={() => {
                  composing.current = false
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing))
                    event.preventDefault()
                }}
              />
            </Label>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {translate('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || (rename && !name.trim())}>
              {rename ? translate('confirmRename') : translate('confirmDeletion')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
