import { Expand, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useMessages } from '@renderer/i18n/useMessages'
import {
  useTiledImageViewer,
  type TiledImageSource,
} from '@renderer/components/metadata/hooks/useTiledImageViewer'

export interface TiledImageViewerProps extends TiledImageSource {
  className?: string
  previewUrl?: string
}

export const TiledImageViewer = ({ className, previewUrl, ...source }: TiledImageViewerProps) => {
  const { translate } = useMessages()
  const { container, status, zoom, fit } = useTiledImageViewer(source)
  return (
    <div
      className={cn(
        'relative h-full min-h-64 w-full overflow-hidden rounded-lg bg-muted',
        className,
      )}
    >
      {previewUrl && status.state !== 'ready' && (
        <img src={previewUrl} alt="" className="absolute size-full object-contain" />
      )}
      <div
        ref={container}
        role="region"
        aria-label={translate('previewImage')}
        aria-busy={status.state === 'loading'}
        className="absolute inset-0 outline-none focus-within:ring-2 focus-within:ring-ring"
      />
      {status.state === 'loading' && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm"
        >
          <span className="rounded bg-background/90 px-3 py-1 text-muted-foreground">
            {translate('loading')}
          </span>
        </div>
      )}
      {status.state === 'error' && (
        <div
          role="alert"
          className="absolute inset-x-3 top-3 rounded bg-background/95 p-3 text-sm text-destructive"
        >
          {status.message}
        </div>
      )}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg border bg-background/95 p-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('zoomOut')}
          disabled={status.state !== 'ready'}
          onClick={() => {
            zoom(1 / 1.5)
          }}
        >
          <ZoomOut />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('fitCanvas')}
          disabled={status.state !== 'ready'}
          onClick={fit}
        >
          <Expand />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('zoomIn')}
          disabled={status.state !== 'ready'}
          onClick={() => {
            zoom(1.5)
          }}
        >
          <ZoomIn />
        </Button>
      </div>
    </div>
  )
}

export default TiledImageViewer
