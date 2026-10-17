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
          <DialogTitle>{rename ? '重命名画布' : '删除画布'}</DialogTitle>
          <DialogDescription>
            {rename
              ? '画布名称只用于底部标签，不会更改中心主题。'
              : `将删除“${action.name}”及其中的全部主题。`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="sheet-dialog-form"
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
            <Label className="sheet-name-label items-stretch" htmlFor={nameId}>
              画布名称
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
          <div className="sheet-dialog-actions">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || (rename && !name.trim())}>
              {rename ? '确认重命名' : '确认删除'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
