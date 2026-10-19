import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useMessages } from '@renderer/i18n/useMessages'
import { TemplateChoices } from '@renderer/components/creation/TemplateChoices'

import { useRef, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { watchCreationTarget } from '@renderer/state/creationTarget'
import { isDirty, useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { createTemplate, type TemplateId } from '@renderer/components/documents/templates'

export const TemplateDialog = () => {
  const { translate } = useMessages()

  const sequence = useRef(0)
  const inFlight = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const create = async (id: TemplateId): Promise<void> => {
    const state = useEditor.getState()
    if (state.busy || inFlight.current) return
    state.commitDraft()
    if (useEditor.getState().editingId) return
    if (isDirty() && !window.confirm(translate('thisMapHasUnsavedChangesDiscardThem'))) return
    inFlight.current = true
    const currentSequence = ++sequence.current
    const target = watchCreationTarget()
    const history = useEditor.getState().history
    setPending(true)
    setError(false)
    try {
      const document = await createTemplate(id)
      const current = useEditor.getState()
      if (
        !target.valid() ||
        sequence.current !== currentSequence ||
        current.busy ||
        current.history !== history
      )
        return
      current.replace(document, null, true)
      setOpen(false)
    } catch {
      if (target.valid() && sequence.current === currentSequence) setError(true)
    } finally {
      target.dispose()
      inFlight.current = false
      setPending(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) sequence.current += 1
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplate className="size-4" />
          {translate('template')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('createFromTemplate')}</DialogTitle>
          <DialogDescription>{translate('createAnEditableMapTheCurrentFile')}</DialogDescription>
        </DialogHeader>
        {pending && <LoadingState label={translate('templateLoading')} />}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {translate('templateLoadFailed')}
          </p>
        )}
        <TemplateChoices
          value="blank"
          includeBlank={false}
          disabled={pending}
          onChange={(id) => {
            if (id !== 'blank') void create(id)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
