import type { MessageTranslator } from '@renderer/i18n'
import { useMessages } from '@renderer/i18n/useMessages'

import { useRef, useState } from 'react'
import type { MindMapWorkbook } from '@core'
import { Download } from 'lucide-react'
import {
  createExport,
  exportNotice,
  type ExportFormat,
  type ExportRequest,
} from '@renderer/export/files'
import { printSheet } from '@renderer/export/print'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { requireDesktopAPI } from '@renderer/lib/desktop'

const getFormats = (
  translate: MessageTranslator,
): readonly { value: ExportFormat; label: string }[] => [
  {
    value: 'png',
    label: translate('pngImage'),
  },
  {
    value: 'svg',
    label: translate('svgVector'),
  },
  {
    value: 'pdf',
    label: translate('pdfDocument'),
  },
  {
    value: 'md',
    label: translate('markdownOutline'),
  },
  {
    value: 'opml',
    label: translate('opmlOutline'),
  },
  {
    value: 'txt',
    label: translate('plainTextOutline'),
  },
  {
    value: 'xmind',
    label: translate('xmindWorkbook'),
  },
]
export interface ExportDialogProps {
  workbook: MindMapWorkbook
  currentSheetId: string
  onExport?: (request: ExportRequest) => Promise<string | null>
  defaultOpen?: boolean
}
export const ExportDialog = ({
  workbook,
  currentSheetId,
  onExport = (request) => requireDesktopAPI().exportFile(request),
  defaultOpen = false,
}: ExportDialogProps) => {
  const { translate, translateLabel } = useMessages()
  const formats = getFormats(translate)

  const [open, setOpen] = useState(defaultOpen)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scope, setScope] = useState<'sheet' | 'workbook'>('sheet')
  const [collapsed, setCollapsed] = useState<'visible' | 'all'>('visible')
  const [scale, setScale] = useState<'0.5' | '1' | '2'>('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submitting = useRef(false)
  const diagram = ['png', 'svg', 'pdf'].includes(format)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next)
          setMessage('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Download className="size-4" />
          {translate('export')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="gap-5"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('exportMap')}</DialogTitle>
          <DialogDescription>
            {translate('exportingACopyKeepsTheCurrentDocument')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (submitting.current) return
            submitting.current = true
            setBusy(true)
            setMessage('')
            void createExport(workbook, {
              format,
              sheetId: currentSheetId,
              wholeWorkbook: !diagram && scope === 'workbook',
              includeCollapsed: collapsed === 'all',
              scale: Number(scale),
            })
              .then(onExport)
              .then((path) => {
                setMessage(
                  path === null
                    ? translate('exportCancelled')
                    : translate('exportedValue0', { value0: path }),
                )
              })
              .catch((error: unknown) => {
                setMessage(
                  error instanceof Error ? error.message : translate('exportFailedPleaseRetry'),
                )
              })
              .finally(() => {
                submitting.current = false
                setBusy(false)
              })
          }}
        >
          <Label className="grid gap-2">
            {translate('fileFormat')}
            <FieldSelect
              label={translate('exportFormat')}
              value={format}
              options={formats}
              onChange={setFormat}
            />
          </Label>
          {!diagram && (
            <Label className="grid gap-2">
              {translate('exportScope')}
              <FieldSelect
                label={translate('exportScope')}
                value={scope}
                options={[
                  { value: 'sheet', label: translate('currentSheet') },
                  { value: 'workbook', label: translate('allSheetsLabel508') },
                ]}
                onChange={setScope}
              />
            </Label>
          )}
          {diagram && (
            <Label className="grid gap-2">
              {translate('collapsedBranches')}
              <FieldSelect
                label={translate('collapsedBranches')}
                value={collapsed}
                options={[
                  { value: 'visible', label: translate('keepCollapsedState') },
                  { value: 'all', label: translate('expandAllTopics') },
                ]}
                onChange={setCollapsed}
              />
            </Label>
          )}
          {(format === 'png' || format === 'pdf') && (
            <Label className="grid gap-2">
              {translate('imageScale')}
              <FieldSelect
                label={translate('imageScale')}
                value={scale}
                options={[
                  { value: '0.5', label: translate('05') },
                  { value: '1', label: translate('1') },
                  { value: '2', label: translate('2') },
                ]}
                onChange={setScale}
              />
            </Label>
          )}
          <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
            {translateLabel(exportNotice[format])}
          </p>
          {message && (
            <p role="status" className="break-all text-sm">
              {message}
            </p>
          )}
          <DialogFooter>
            {diagram && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (submitting.current) return
                  const sheet = workbook.sheets.find((entry) => entry.id === currentSheetId)
                  if (!sheet) {
                    setMessage(translate('sheetToPrintDoesNotExist'))
                    return
                  }
                  submitting.current = true
                  setBusy(true)
                  setMessage('')
                  void printSheet(sheet.document, collapsed === 'all')
                    .then(() => {
                      setMessage(translate('printDialogOpenedChooseAPrinterPaper'))
                    })
                    .catch((error: unknown) => {
                      setMessage(
                        error instanceof Error ? error.message : translate('printingFailed'),
                      )
                    })
                    .finally(() => {
                      submitting.current = false
                      setBusy(false)
                    })
                }}
              >
                {translate('printCurrentSheet')}
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                {translate('close')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? translate('exporting') : translate('exportFile')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
