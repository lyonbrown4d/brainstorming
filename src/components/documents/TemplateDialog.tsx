import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
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
import {
  createTemplate,
  templateOptions,
  type TemplateId,
} from '@renderer/components/documents/templates'

export const TemplateDialog = () => {
  const { translate, translateLabel } = useMessages()

  const [open, setOpen] = useState(false)
  const create = (id: TemplateId): void => {
    const state = useEditor.getState()
    if (state.busy) return
    state.commitDraft()
    if (useEditor.getState().editingId) return
    if (isDirty() && !window.confirm(translate('thisMapHasUnsavedChangesDiscardThem'))) return
    state.replace(createTemplate(id), null, true)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <div className="grid grid-cols-2 gap-3">
          {templateOptions.map((template) => (
            <Button
              key={template.id}
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => {
                create(template.id)
              }}
            >
              <LayoutTemplate className="size-5 text-primary" />
              {translateLabel(template.title)}
              <span className="text-xs font-normal text-muted-foreground">
                {template.count}
                {translate('editableTopics')}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
