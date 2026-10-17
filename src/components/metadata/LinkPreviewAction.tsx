import { getAssetUrl } from '@renderer/lib/resource'
import { Camera, LoaderCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import { isPreviewUrl, useCachedLinkPreview, useLinkPreview } from '@renderer/hooks/useLinkPreview'

export const LinkPreviewAction = ({ topicId, url }: { topicId: string; url: string }) => {
  const { translate } = useMessages()
  const preview = useLinkPreview(topicId, url)
  const cached = useCachedLinkPreview(url)
  if (!isPreviewUrl(url)) return null
  return (
    <div className="space-y-2 border-t border-border pt-3">
      {cached.data && (
        <img
          src={getAssetUrl(cached.data)}
          alt={url}
          className="max-h-36 w-full rounded-md border border-border object-contain"
          loading="lazy"
        />
      )}
      {!cached.data && !cached.error && (
        <p className="text-xs text-muted-foreground" role="status">
          {translate('screenshotLinkQueued')}
        </p>
      )}
      {cached.error && (
        <p className="text-xs text-destructive" role="alert">
          {cached.error.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{translate('screenshotLinkHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={preview.loading}
          onClick={preview.capture}
        >
          {preview.loading ? (
            <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
          ) : (
            <Camera className="size-3" />
          )}
          {translate(preview.loading ? 'screenshotLinkBusy' : 'screenshotLink')}
        </Button>
        {preview.loading && (
          <Button variant="ghost" size="sm" type="button" onClick={preview.cancel}>
            {translate('cancel')}
          </Button>
        )}
      </div>
      {preview.error && (
        <p className="text-xs text-destructive" role="alert">
          {preview.error}
        </p>
      )}
      {preview.success && (
        <p className="text-xs text-muted-foreground" role="status">
          {translate('screenshotLinkDone')}
        </p>
      )}
    </div>
  )
}
