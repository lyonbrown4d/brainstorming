import type { ExportDialogProps } from '@renderer/components/export/types'
import { useEffect, useRef, useState } from 'react'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import type { ImageExportProgress } from '@shared/exportImages'
import { useMessages } from '@renderer/i18n/useMessages'
import { createExport, exportNotice } from '@renderer/export/files'
import { resolveRasterSize } from '@renderer/export/quality'
import { printSheet } from '@renderer/export/print'
import { getPlatformAPI, requireDesktopAPI } from '@renderer/lib/desktop'
import { useExportPreview } from '@renderer/components/hooks/useExportPreview'
import { ExportPreview } from '@renderer/components/export/ExportPreview'
import { ExportSettings } from '@renderer/components/export/ExportSettings'
import {
  isNativeImageFormat,
  isVisualExport,
  type DialogExportFormat,
} from '@renderer/components/export/types'
import { Button } from '@renderer/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'

export const ExportPanel = ({
  workbook,
  currentSheetId,
  onExport,
  onExportImage,
  onBusyChange,
}: ExportDialogProps & { readonly onBusyChange: (value: boolean) => void }) => {
  const { translate, translateLabel } = useMessages()
  const [format, setFormat] = useState<DialogExportFormat>('png')
  const [scope, setScope] = useState('sheet')
  const [collapsed, setCollapsed] = useState('visible')
  const [quality, setQuality] = useState('auto')
  const [jpegQuality, setJpegQuality] = useState('92')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [stage, setStage] = useState<'preparing' | 'choosing' | ImageExportProgress['stage']>(
    'preparing',
  )
  const submitting = useRef(false)
  const activeJob = useRef<string | null>(null)
  const visual = isVisualExport(format)
  const preview = useExportPreview(workbook, currentSheetId, collapsed === 'all')
  const scale = quality === 'auto' ? undefined : Number(quality)
  const sheet = workbook.sheets.find((item) => item.id === currentSheetId)
  let sizeLabel: string | null = null
  let sizeWarning: string | null = null
  let sizeInvalid = false
  if (preview.source) {
    if (format === 'svg') sizeLabel = translate('exportVectorQuality')
    else {
      try {
        const size = resolveRasterSize(preview.source, scale)
        sizeLabel = `${size.width.toLocaleString()} × ${size.height.toLocaleString()} px`
        if (size.limited) sizeWarning = translate('exportAutoLimited')
      } catch {
        sizeWarning = translate('exportSizeExceeded')
        sizeInvalid = true
      }
    }
  }
  useEffect(() => {
    return getPlatformAPI()?.onExportProgress((progress) => {
      if (progress.jobId === activeJob.current) setStage(progress.stage)
    })
  }, [])
  const run = async (printing = false): Promise<void> => {
    if (submitting.current || (visual && (!preview.source || sizeInvalid))) return
    submitting.current = true
    onBusyChange(true)
    setBusy(true)
    setFailed(false)
    setMessage('')
    setStage('preparing')
    try {
      if (printing) {
        if (!sheet) throw new Error(translate('sheetToPrintDoesNotExist'))
        await printSheet(sheet.document, collapsed === 'all')
        setMessage(translate('printDialogOpenedChooseAPrinterPaper'))
        return
      }
      let path: string | null
      const compute = getPlatformAPI()?.compute
      if (isNativeImageFormat(format)) {
        if (!preview.source || !sheet) throw new Error(translate('sheetToExportDoesNotExist'))
        const jobId = crypto.randomUUID()
        activeJob.current = jobId
        const name =
          sheet.name.replace(/[\p{Cc}<>:"/\\|?*]/gu, '_').slice(0, 100) || 'Brainstorming'
        setStage('choosing')
        path = await (onExportImage ?? ((request) => requireDesktopAPI().exportImage(request)))({
          jobId,
          format,
          suggestedName: `${name}.${format}`,
          ...preview.source,
          ...(scale === undefined ? {} : { scale }),
          ...(format === 'jpg' ? { jpegQuality: Number(jpegQuality) } : {}),
        })
      } else if (
        compute &&
        (format === 'md' || format === 'opml' || format === 'txt' || format === 'xmind')
      ) {
        setStage('choosing')
        path = await compute.exportFormat(
          workbook,
          format,
          scope === 'workbook' ? undefined : currentSheetId,
        )
      } else {
        const request = await createExport(
          workbook,
          {
            format,
            sheetId: currentSheetId,
            wholeWorkbook: !visual && scope === 'workbook',
            includeCollapsed: collapsed === 'all',
            ...(scale === undefined ? {} : { scale }),
          },
          preview.source ?? undefined,
        )
        setStage('choosing')
        path = await (onExport ?? ((value) => requireDesktopAPI().exportFile(value)))(request)
      }
      setMessage(
        path === null
          ? translate('exportCancelled')
          : translate('exportedValue0', { value0: path }),
      )
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : translate('exportFailedPleaseRetry'))
    } finally {
      activeJob.current = null
      submitting.current = false
      onBusyChange(false)
      setBusy(false)
    }
  }
  const stageText =
    stage === 'choosing'
      ? translate('exportChoosingLocation')
      : stage === 'rendering'
        ? translate('exportRendering')
        : stage === 'encoding'
          ? translate('exportEncoding')
          : stage === 'writing' || stage === 'done'
            ? translate('exportWriting')
            : translate('exportGenerating')
  const notice =
    format === 'jpg'
      ? translate('exportJpegNotice')
      : format === 'webp'
        ? translate('exportWebpNotice')
        : translateLabel(exportNotice[format])
  return (
    <DialogContent
      showCloseButton={!busy}
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 w-[calc(100vw-2rem)] overflow-hidden p-5 sm:max-w-4xl sm:p-6"
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
      }}
      onPointerDownOutside={(event) => {
        if (busy) event.preventDefault()
      }}
    >
      <DialogHeader className="shrink-0 pr-8 text-left">
        <DialogTitle>{translate('exportMap')}</DialogTitle>
        <DialogDescription className="text-xs">
          {translate('exportOptionsDescription')}
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
            <ExportPreview
              url={preview.url}
              loading={preview.loading}
              error={preview.error}
              title={sheet?.name ?? workbook.title}
              visual={visual}
              retry={preview.retry}
            />
            <ExportSettings
              format={format}
              quality={quality}
              jpegQuality={jpegQuality}
              scope={scope}
              collapsed={collapsed}
              busy={busy}
              sizeLabel={sizeLabel}
              sizeWarning={sizeWarning}
              onFormat={(value) => {
                setFormat(value)
                setMessage('')
                setFailed(false)
              }}
              onQuality={setQuality}
              onJpegQuality={setJpegQuality}
              onScope={setScope}
              onCollapsed={setCollapsed}
            />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{notice}</p>
          {busy ? (
            <LoadingState className="text-sm text-foreground" label={stageText} />
          ) : (
            message && (
              <p
                role={failed ? 'alert' : 'status'}
                className={`text-sm break-all ${failed ? 'text-destructive' : 'text-foreground'}`}
              >
                {message}
              </p>
            )
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-border pt-4">
          {visual && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || preview.loading || Boolean(preview.error) || sizeInvalid}
              onClick={() => {
                void run(true)
              }}
            >
              {translate('exportPrint')}
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={busy}>
              {translate('close')}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            aria-label={translate('exportFile')}
            disabled={busy || (visual && (!preview.source || sizeInvalid))}
          >
            {busy && <LoadingIndicator className="size-4" />}
            {busy
              ? translate('exporting')
              : translate('exportFormatAction', { format: format.toUpperCase() })}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
