import { RotateCcw } from 'lucide-react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { SpatialDepthControl } from '@renderer/components/spatial/SpatialDepthControl'
import { SpatialCameraControls } from '@renderer/components/spatial/SpatialCameraControls'
import { SpatialCameraWidget } from '@renderer/components/spatial/SpatialCameraWidget'
import { Button } from '@renderer/components/ui/button'
import { DEFAULT_SPATIAL_VIEW } from '@renderer/state/spatialView'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { useMessages } from '@renderer/i18n/useMessages'

/** Same property controls, positioned outside either rendering library. */
export const IndependentSpatialControls = ({
  runtime,
  disabled,
}: {
  runtime: IndependentSpatialRuntime
  disabled: boolean
}) => {
  const { translate } = useMessages()
  return (
    <>
      <div
        data-spatial-controls
        className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-border/80 bg-background p-1 shadow-floating"
      >
        <SpatialDepthControl />
        <SpatialCameraControls layout={runtime.model.layout} depths={runtime.model.depths} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={disabled}
          aria-label={translate('spatialResetCamera')}
          onClick={() =>
            saveSpatialView({
              yaw: DEFAULT_SPATIAL_VIEW.yaw,
              pitch: DEFAULT_SPATIAL_VIEW.pitch,
              target: { x: 0, y: 0, z: 0 },
            })
          }
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      <div data-spatial-controls className="absolute top-3 right-3 z-10">
        <SpatialCameraWidget disabled={disabled} onReady={() => undefined} />
      </div>
      <p
        data-spatial-controls
        className="pointer-events-none absolute right-3 bottom-3 z-10 max-w-[70%] rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] text-secondary-foreground shadow-floating"
      >
        {translate('spatialCameraHint')}
      </p>
    </>
  )
}
