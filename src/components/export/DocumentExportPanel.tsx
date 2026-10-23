import { useEffect, useRef, useState } from 'react'
import { useLocalStorageState } from 'ahooks'
import type { MindMapWorkbook } from '@core'
import type { DocumentExportProgress, DocumentExportsAPI } from '@shared/documentExports'
import {
  DocumentExportFormat,
  DocumentExportStage,
  ExportContent,
  ExportScope,
} from '@shared/documentExports'
import { prepareDocumentExport } from '@renderer/export/prepareDocumentExport'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { getSpatialView } from '@renderer/state/spatialView'
import { selectedDrawingIds, selectedTopicIds } from '@renderer/state/selection'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { DocumentExportPreview } from '@renderer/components/export/DocumentExportPreview'
import { DocumentExportActions } from '@renderer/components/export/DocumentExportActions'
import { DocumentExportStatus } from '@renderer/components/export/DocumentExportStatus'
import { buildDocumentExportRequest } from '@renderer/components/export/documentRequest'
import { DocumentExportSettings } from '@renderer/components/export/DocumentExportSettings'
import { useDocumentExportPreview } from '@renderer/components/export/hooks/useDocumentExportPreview'
import { useExportViewPreview } from '@renderer/components/export/hooks/useExportViewPreview'
import {
  defaultExportPreferences,
  rasterFormats,
  sanitizeExportPreferences,
  viewFormats,
  visualFormats,
  type ExportPreferences,
} from '@renderer/components/export/documentOptions'

export const DocumentExportPanel = ({
  workbook,
  currentSheetId,
  api,
  onBusyChange,
}: {
  readonly workbook: MindMapWorkbook
  readonly currentSheetId: string
  readonly api: DocumentExportsAPI
  readonly onBusyChange: (busy: boolean) => void
}) => {
  const { translate } = useMessages()
  const [saved, save] = useLocalStorageState<unknown>('brainstorming-export-center-v2', {
    defaultValue: defaultExportPreferences,
  })
  const prefs = sanitizeExportPreferences(saved)
  const update = (next: ExportPreferences) => {
    const view =
      next.content === ExportContent.View && viewAvailable && viewFormats.has(next.format)
    save({
      ...next,
      content: next.content === ExportContent.View && !view ? ExportContent.Map : next.content,
      scope: view ? ExportScope.Current : next.scope,
      transparent: view ? false : next.transparent,
    })
  }
  const [selectedSheets, setSelectedSheets] = useState<readonly string[]>([currentSheetId])
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [resultPath, setResultPath] = useState<string | null>(null)
  const [progress, setProgress] = useState<DocumentExportProgress | null>(null)
  const viewPreview = useExportViewPreview(api, (error) => {
    setFailed(true)
    setMessage(error)
  })
  const activeJob = useRef<string | null>(null)
  const startedJob = useRef(false)
  const cancelled = useRef(false)
  const wasCancelled = () => cancelled.current
  const submitting = useRef(false)
  const visual = visualFormats.has(prefs.format)
  const platform = getPlatformAPI()?.platform
  const viewAvailable = Boolean(
    api.captureView &&
    platform &&
    !['ios', 'android'].includes(platform) &&
    getSpatialView(workbook.id, currentSheetId).mode === '3d',
  )
  const content =
    prefs.content === ExportContent.View && (!viewAvailable || !viewFormats.has(prefs.format))
      ? ExportContent.Map
      : prefs.content
  const viewMode = content === ExportContent.View && viewFormats.has(prefs.format)
  const presentation =
    content === ExportContent.Presentation || prefs.format === DocumentExportFormat.Pptx
  const editor = useEditor.getState()
  const selectedTopics = editor.workbook.id === workbook.id ? selectedTopicIds(editor) : []
  const selectedDrawings = editor.workbook.id === workbook.id ? selectedDrawingIds(editor) : []
  const selectedTopicCount =
    selectedTopics.length + (prefs.scope === ExportScope.Topics ? selectedDrawings.length : 0)
  const sheetIds = viewMode
    ? [currentSheetId]
    : prefs.scope === ExportScope.All
      ? workbook.sheets.map((sheet) => sheet.id)
      : prefs.scope === ExportScope.Sheets
        ? workbook.sheets
            .filter((sheet) => selectedSheets.includes(sheet.id))
            .map((sheet) => sheet.id)
        : [currentSheetId]
  const preview = useDocumentExportPreview(
    api,
    workbook,
    sheetIds,
    presentation,
    prefs.includeCollapsed,
    visual && !viewMode,
    prefs.format,
    prefs.scope === ExportScope.Topics || prefs.scope === ExportScope.Branch ? selectedTopics : [],
    prefs.scope === ExportScope.Topics ? selectedDrawings : [],
    prefs.scope,
  )
  const invalidSelection =
    (prefs.scope === ExportScope.Branch && selectedTopics.length === 0) ||
    (prefs.scope === ExportScope.Topics && selectedTopics.length + selectedDrawings.length === 0)
  const invalidSheets = sheetIds.length === 0
  const customSize = prefs.scale === 'custom'
  const width = Number(prefs.width)
  const height = Number(prefs.height)
  const invalidDimensions =
    rasterFormats.has(prefs.format) &&
    customSize &&
    (!Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      width > 16384 ||
      height < 1 ||
      height > 16384)
  const quality = Number(prefs.jpegQuality)
  const invalidQuality =
    prefs.format === DocumentExportFormat.Jpg &&
    (!Number.isInteger(quality) || quality < 1 || quality > 100)
  const canExport =
    !busy &&
    !invalidSelection &&
    !invalidSheets &&
    !invalidDimensions &&
    !invalidQuality &&
    (!visual || viewMode || (!preview.isPending && !preview.isError && preview.pages.length > 0))

  useEffect(
    () =>
      api.onProgress((next) => {
        if (next.jobId === activeJob.current) setProgress(next)
      }),
    [api],
  )
  const run = async (): Promise<void> => {
    if (!canExport || submitting.current) return
    submitting.current = true
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    setFailed(false)
    setResultPath(null)
    const jobId = crypto.randomUUID()
    activeJob.current = jobId
    startedJob.current = false
    cancelled.current = false
    setProgress({ jobId, stage: DocumentExportStage.Preparing, completed: 0, total: 1 })
    try {
      const request = await buildDocumentExportRequest({
        jobId,
        workbook,
        api,
        prefs,
        sheetIds,
        selectedTopics,
        selectedDrawings,
        content: presentation ? ExportContent.Presentation : content,
      })
      if (wasCancelled()) {
        setMessage(translate('exportCancelled'))
        return
      }
      const prepared = await prepareDocumentExport(api, request)
      if (wasCancelled()) {
        setMessage(translate('exportCancelled'))
        return
      }
      startedJob.current = true
      const path = await api.exportDocument(prepared)
      setResultPath(path)
      setMessage(path === null ? translate('exportCancelled') : translate('exportSuccess'))
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : translate('exportFailedPleaseRetry'))
    } finally {
      activeJob.current = null
      startedJob.current = false
      submitting.current = false
      setCancelling(false)
      setBusy(false)
      onBusyChange(false)
    }
  }
  const cancel = async (): Promise<void> => {
    const jobId = activeJob.current
    if (!jobId || cancelling) return
    cancelled.current = true
    setCancelling(true)
    if (!startedJob.current) return
    try {
      await api.cancel(jobId)
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : translate('exportFailedPleaseRetry'))
      setCancelling(false)
    }
  }
  const openResult = async (reveal: boolean): Promise<void> => {
    if (!resultPath) return
    try {
      await api.openResult(resultPath, reveal)
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : translate('exportFailedPleaseRetry'))
    }
  }
  return (
    <DialogContent
      showCloseButton={!busy}
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] sm:max-w-5xl flex-col gap-4 overflow-hidden p-5 sm:p-6"
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
      }}
      onPointerDownOutside={(event) => {
        if (busy) event.preventDefault()
      }}
    >
      <DialogHeader className="shrink-0 pr-8 text-left">
        <DialogTitle>{translate('exportCenter')}</DialogTitle>
        <DialogDescription>{translate('exportOptionsDescription')}</DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <div className="grid min-h-0 gap-5 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1fr)_16rem]">
          <DocumentExportPreview
            title={workbook.title}
            visual={visual}
            preview={preview}
            viewMode={viewMode}
            viewUrl={viewPreview.url}
            onCapture={() => {
              void viewPreview.capture()
            }}
          />
          <div className="min-w-0 overflow-y-auto pr-1">
            <DocumentExportSettings
              workbook={workbook}
              prefs={{ ...prefs, content }}
              onChange={update}
              selectedSheets={selectedSheets}
              onSelectedSheets={setSelectedSheets}
              selectedTopics={selectedTopicCount}
              preview={viewMode ? viewPreview.page : preview.page}
              busy={busy}
              viewAvailable={viewAvailable}
            />
          </div>
        </div>
        <DocumentExportStatus
          invalidDimensions={invalidDimensions}
          busy={busy}
          cancelling={cancelling}
          progress={progress}
          message={message}
          failed={failed}
        />
        <DocumentExportActions
          busy={busy}
          cancelling={cancelling}
          canExport={canExport}
          resultPath={resultPath}
          format={prefs.format}
          onCancel={() => {
            void cancel()
          }}
          onOpenResult={(reveal) => {
            void openResult(reveal)
          }}
        />
      </form>
    </DialogContent>
  )
}
