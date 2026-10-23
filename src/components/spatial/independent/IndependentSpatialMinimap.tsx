import { Map, X } from 'lucide-react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useIndependentSpatialMinimap } from '@renderer/hooks/useIndependentSpatialMinimap'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'

/** Optional delayed overview for the Three canvas, using one ordinary bitmap and shared preferences. */
export const IndependentSpatialMinimap = ({
  runtime,
  disabled = false,
}: {
  readonly runtime: IndependentSpatialRuntime
  readonly disabled?: boolean
}) => {
  const { translate } = useMessages()
  const visible = useCanvasPreferences((state) => state.minimap)
  const setVisible = useCanvasPreferences((state) => state.setMinimap)
  const { canvas, focus, viewportMask } = useIndependentSpatialMinimap(
    runtime,
    visible && !disabled,
  )
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[5] @max-[640px]:bottom-32">
      {visible ? (
        <div className="relative h-28 w-44 overflow-hidden rounded-lg border border-border/80 bg-background @max-[640px]:h-20 @max-[640px]:w-28">
          <canvas
            ref={canvas}
            className="block size-full touch-none"
            data-spatial-minimap
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={translate('canvasMinimap')}
            aria-disabled={disabled}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              focus()
            }}
          />
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <path
              ref={viewportMask}
              data-spatial-minimap-mask
              fillRule="evenodd"
              fillOpacity={0.72}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          </svg>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 z-10 size-6 rounded-md bg-background text-muted-foreground"
            aria-label={translate('hideMinimap')}
            title={translate('hideMinimap')}
            onClick={() => {
              setVisible(false)
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg bg-background text-muted-foreground shadow-none"
          aria-label={translate('showMinimap')}
          title={translate('showMinimap')}
          onClick={() => {
            setVisible(true)
          }}
        >
          <Map className="size-4" />
        </Button>
      )}
    </div>
  )
}
