import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ExportPreview } from '@renderer/components/export/ExportPreview'
import type { useDocumentExportPreview } from '@renderer/components/export/hooks/useDocumentExportPreview'
import { useMessages } from '@renderer/i18n/useMessages'

export const DocumentExportPreview = ({
  title,
  visual,
  preview,
  viewMode,
  viewUrl,
  onCapture,
}: {
  readonly title: string
  readonly visual: boolean
  readonly preview: ReturnType<typeof useDocumentExportPreview>
  readonly viewMode: boolean
  readonly viewUrl: string | null
  readonly onCapture: () => void
}) => {
  const { translate } = useMessages()
  return (
    <div className="min-w-0 space-y-2">
      <ExportPreview
        url={viewMode ? viewUrl : preview.url}
        loading={visual && !viewMode && preview.isPending}
        error={!viewMode && preview.isError ? preview.error : null}
        title={preview.page?.title ?? title}
        visual={visual}
        retry={() => {
          void preview.refetch()
        }}
      />
      {viewMode && (
        <Button type="button" variant="outline" size="sm" onClick={onCapture}>
          {translate('exportCapturePreview')}
        </Button>
      )}
      {visual && !viewMode && preview.pages.length > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={translate('exportPreviousPage')}
            disabled={preview.index === 0}
            onClick={() => {
              preview.setIndex(preview.index - 1)
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular-nums">
            {translate('exportPagePosition', {
              current: preview.index + 1,
              total: preview.pages.length,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={translate('exportNextPage')}
            disabled={preview.index >= preview.pages.length - 1}
            onClick={() => {
              preview.setIndex(preview.index + 1)
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
      {visual &&
        !viewMode &&
        !preview.isPending &&
        !preview.isError &&
        preview.pages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {translate('exportPreviewEmpty')}
          </p>
        )}
    </div>
  )
}
