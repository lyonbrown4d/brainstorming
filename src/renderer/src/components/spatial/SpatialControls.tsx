import { useMessages } from '@renderer/i18n/useMessages'

import { Focus, Maximize2, Minus, Plus, Rotate3D } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '@renderer/components/ui/button'
import type { SpatialCameraActions } from '@renderer/components/spatial/types'

export const SpatialControls = ({
  actions,
  focused,
  zoom,
}: {
  actions: RefObject<SpatialCameraActions | null>
  focused: boolean
  zoom: number
}) => {
  const { translate } = useMessages()

  return (
    <div
      className="pointer-events-auto absolute right-4 bottom-4 z-30 flex h-9 items-center gap-0.5 rounded-lg border border-border bg-background/95 p-0.5 text-muted-foreground shadow-sm @max-[640px]:bottom-32"
      role="group"
      aria-label={translate('3dCanvasView')}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={translate('zoomOut3dCanvas')}
        onClick={() => actions.current?.zoom('out')}
      >
        <Minus />
      </Button>
      <output
        className="min-w-11 text-center text-xs tabular-nums"
        aria-label={translate('3dZoomLevel')}
      >
        {zoom}%
      </output>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={translate('zoomIn3dCanvas')}
        onClick={() => actions.current?.zoom('in')}
      >
        <Plus />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={focused ? translate('fitBranch') : translate('fitMap')}
        title={focused ? translate('fitBranch') : translate('fitMap')}
        onClick={() => actions.current?.fit()}
      >
        {focused ? <Focus /> : <Maximize2 />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={translate('resetCamera')}
        title={translate('resetCamera')}
        onClick={() => actions.current?.reset()}
      >
        <Rotate3D />
      </Button>
    </div>
  )
}
