import { useMessages } from '@renderer/i18n/useMessages'

import { useId, useRef, useState } from 'react'
import type { MindMapWorkbook } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
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

export interface ImportTextDialogProps {
  onImport:
    | ((workbook: MindMapWorkbook) => void)
    | ((workbook: MindMapWorkbook) => boolean | Promise<boolean>)
  defaultOpen?: boolean
}
export const ImportTextDialog = ({ onImport, defaultOpen = false }: ImportTextDialogProps) => {
  const { translate } = useMessages()

  const [open, setOpen] = useState(defaultOpen)
  const [format, setFormat] = useState<'md' | 'opml' | 'txt'>('md')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<MindMapWorkbook | null>(null)
  const locked = useRef(false)
  const textId = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next)
          setError('')
          setPreview(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {translate('importOutline')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('importOutline')}</DialogTitle>
          <DialogDescription>{translate('checkTheTopicCountBeforeOpeningA')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (locked.current) return
            locked.current = true
            setBusy(true)
            setError('')
            const compute = requireDesktopAPI().compute
            void (
              compute
                ? compute.importText(format, text)
                : Promise.reject(new Error('原生导入服务不可用'))
            )
              .then(setPreview)
              .catch((cause: unknown) => {
                setPreview(null)
                setError(cause instanceof Error ? cause.message : translate('couldNotParseOutline'))
              })
              .finally(() => {
                locked.current = false
                setBusy(false)
              })
          }}
        >
          <FieldSelect
            label={translate('outlineFormat')}
            value={format}
            options={[
              { value: 'md', label: 'Markdown' },
              { value: 'opml', label: 'OPML' },
              { value: 'txt', label: 'TXT' },
            ]}
            onChange={(value) => {
              setFormat(value)
              setPreview(null)
            }}
          />
          <Label className="grid gap-2">
            {translate('chooseTextFile')}
            <Input
              type="file"
              accept=".md,.markdown,.opml,.xml,.txt,text/markdown,text/xml,text/plain"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (file.size > 8 * 1024 * 1024) {
                  setError(translate('outlineTextCannotExceed8Mib'))
                  return
                }
                void file
                  .text()
                  .then((content) => {
                    setText(content)
                    setFormat(
                      /\.(?:opml|xml)$/i.test(file.name)
                        ? 'opml'
                        : /\.txt$/i.test(file.name)
                          ? 'txt'
                          : 'md',
                    )
                    setPreview(null)
                    setError('')
                  })
                  .catch(() => {
                    setError(translate('couldNotReadFile'))
                  })
              }}
            />
          </Label>
          <Label htmlFor={textId}>{translate('orPasteOutlineText')}</Label>
          <Textarea
            id={textId}
            value={text}
            disabled={busy}
            rows={9}
            className="resize-y font-mono"
            onChange={(event) => {
              setText(event.target.value)
              setPreview(null)
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {preview && (
            <p role="status" className="text-sm">
              {translate('total')}
              {preview.sheets.length}
              {translate('sheets')}
              {preview.sheets.reduce(
                (sum, sheet) => sum + Object.keys(sheet.document.topics).length,
                0,
              )}{' '}
              {translate('topicsImportDoesNotExecuteHtmlOr')}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                {translate('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
              {translate('checkOutline')}
            </Button>
            <Button
              type="button"
              disabled={busy || !preview}
              onClick={() => {
                if (!preview || locked.current) return
                locked.current = true
                setBusy(true)
                setError('')
                void Promise.resolve()
                  .then(() => onImport(preview))
                  .then((result) => {
                    if (result !== false) setOpen(false)
                  })
                  .catch((cause: unknown) => {
                    setError(cause instanceof Error ? cause.message : translate('importFailed'))
                  })
                  .finally(() => {
                    locked.current = false
                    setBusy(false)
                  })
              }}
            >
              {busy ? translate('importing') : translate('openImportedMap')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
