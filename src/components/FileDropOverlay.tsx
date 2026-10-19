import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { FileUp, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'

export interface FileDropOverlayProps {
  dragging: boolean
  loading: boolean
  error: string | null
  dismissError: () => void
}

export const FileDropOverlay = ({
  dragging,
  loading,
  error,
  dismissError,
}: FileDropOverlayProps) => {
  const { translate } = useMessages()
  if (!dragging && !loading && !error) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center p-6">
      {dragging && (
        <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm" />
      )}
      <div
        className={`relative flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-popover p-6 text-center text-popover-foreground shadow-xl ${error ? 'pointer-events-auto' : 'pointer-events-none'}`}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
        aria-busy={loading}
      >
        {error ? (
          <>
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={dismissError}>
              <X className="size-4" />
              {translate('dismissError')}
            </Button>
          </>
        ) : (
          <>
            {loading ? (
              <LoadingIndicator className="size-8 text-primary" />
            ) : (
              <FileUp className="size-8 text-primary" />
            )}
            <p className="font-medium">
              {translate(loading ? 'importingDroppedFiles' : 'dropFilesTitle')}
            </p>
            {!loading && (
              <p className="text-sm text-muted-foreground">{translate('dropFilesHint')}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
