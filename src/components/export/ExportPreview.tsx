import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { FileText, RotateCcw } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'

export const ExportPreview = ({
  url,
  loading,
  error,
  title,
  visual,
  retry,
}: {
  readonly url: string | null
  readonly loading: boolean
  readonly error: unknown
  readonly title: string
  readonly visual: boolean
  readonly retry: () => void
}) => {
  const { translate } = useMessages()
  return (
    <section
      aria-label={translate('exportPreview')}
      aria-busy={loading}
      className="flex min-h-60 min-w-0 flex-col rounded-lg bg-muted/60 sm:min-h-80"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
        <span className="truncate">{title}</span>
        <span className="shrink-0">{translate('exportPreview')}</span>
      </div>
      <div className="flex min-h-48 flex-1 items-center justify-center p-4 sm:min-h-64">
        {!visual ? (
          <div className="space-y-3 text-center text-muted-foreground">
            <FileText aria-hidden className="mx-auto size-8" />
            <p className="text-xs">{translate('exportOutlinePreview')}</p>
          </div>
        ) : loading ? (
          <LoadingState variant="surface" label={translate('exportPreviewLoading')} />
        ) : error ? (
          <div className="max-w-64 space-y-3 text-center">
            <p className="text-xs text-destructive">{translate('exportPreviewFailed')}</p>
            <p className="text-xs break-words text-muted-foreground">
              {error instanceof Error ? error.message : ''}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              <RotateCcw aria-hidden className="size-3.5" />
              {translate('exportRetry')}
            </Button>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={title}
            className="max-h-[min(48dvh,30rem)] max-w-full object-contain"
          />
        ) : null}
      </div>
    </section>
  )
}
