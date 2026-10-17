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
  const [open, setOpen] = useState(false)
  const create = (id: TemplateId): void => {
    const state = useEditor.getState()
    if (state.busy) return
    state.commitDraft()
    if (useEditor.getState().editingId) return
    if (isDirty() && !window.confirm('当前导图有未保存的更改。放弃这些更改并使用模板？')) return
    state.replace(createTemplate(id), null, true)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplate className="size-4" />
          模板
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从模板创建</DialogTitle>
          <DialogDescription>
            创建一份可编辑的新导图，当前文件保持原来的磁盘内容。
          </DialogDescription>
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
              {template.title}
              <span className="text-xs font-normal text-muted-foreground">
                {template.count} 个可编辑主题
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
