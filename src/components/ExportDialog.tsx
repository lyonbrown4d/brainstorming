import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogTrigger } from '@renderer/components/ui/dialog'
import { ExportPanel } from '@renderer/components/export/ExportPanel'
import { DocumentExportPanel } from '@renderer/components/export/DocumentExportPanel'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { useExportDialog } from '@renderer/state/exportDialog'
import { useMessages } from '@renderer/i18n/useMessages'
import type { ExportDialogProps } from '@renderer/components/export/types'
export type { ExportDialogProps } from '@renderer/components/export/types'

export const ExportDialog = (props: ExportDialogProps) => {
  const { translate } = useMessages()
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const menuOpen = useExportDialog((state) => state.open && state.workbookId === props.workbook.id)
  const closeMenu = useExportDialog((state) => state.close)
  const busy = useRef(false)
  const api = props.exportAPI ?? getPlatformAPI()?.exports
  return (
    <Dialog
      open={open || menuOpen}
      onOpenChange={(next) => {
        if (!busy.current) {
          setOpen(next)
          if (!next) closeMenu()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Download className="size-4" />
          {translate('export')}
        </Button>
      </DialogTrigger>
      {(open || menuOpen) &&
        (props.onExport || props.onExportImage || !api ? (
          <ExportPanel
            {...props}
            onBusyChange={(value) => {
              busy.current = value
            }}
          />
        ) : (
          <DocumentExportPanel
            workbook={props.workbook}
            currentSheetId={props.currentSheetId}
            api={api}
            onBusyChange={(value) => {
              busy.current = value
            }}
          />
        ))}
    </Dialog>
  )
}
