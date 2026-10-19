import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogTrigger } from '@renderer/components/ui/dialog'
import { ExportPanel } from '@renderer/components/export/ExportPanel'
import { useMessages } from '@renderer/i18n/useMessages'
import type { ExportDialogProps } from '@renderer/components/export/types'
export type { ExportDialogProps } from '@renderer/components/export/types'

export const ExportDialog = (props: ExportDialogProps) => {
  const { translate } = useMessages()
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const busy = useRef(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy.current) setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Download className="size-4" />
          {translate('export')}
        </Button>
      </DialogTrigger>
      {open && (
        <ExportPanel
          {...props}
          onBusyChange={(value) => {
            busy.current = value
          }}
        />
      )}
    </Dialog>
  )
}
