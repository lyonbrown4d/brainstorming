import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'

export const CanvasLoading = ({ error, retry }: { error: boolean; retry: () => unknown }) => {
  const { translate } = useMessages()
  return (
    <div
      className="absolute inset-0 z-40 grid cursor-wait place-items-center bg-background/80 backdrop-blur-sm"
      aria-busy={!error}
      data-canvas-loading
    >
      {error ? (
        <div
          className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-sm"
          role="alert"
        >
          <span>{translate('operationFailedPleaseRetry')}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              retry()
            }}
          >
            {translate('retry')}
          </Button>
        </div>
      ) : (
        <LoadingState
          label={translate('loading')}
          className="rounded-lg border bg-background px-4 py-3 shadow-sm"
        />
      )}
    </div>
  )
}
