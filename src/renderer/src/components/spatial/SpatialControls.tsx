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
  return (
    <div
      className="pointer-events-auto absolute right-4 bottom-4 z-30 flex h-9 items-center gap-0.5 rounded-lg border border-border bg-background/95 p-0.5 text-muted-foreground shadow-sm @max-[640px]:bottom-32"
      role="group"
      aria-label="3D 画布视图"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="缩小 3D 画布"
        onClick={() => actions.current?.zoom('out')}
      >
        <Minus />
      </Button>
      <output className="min-w-11 text-center text-xs tabular-nums" aria-label="3D 缩放比例">
        {zoom}%
      </output>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="放大 3D 画布"
        onClick={() => actions.current?.zoom('in')}
      >
        <Plus />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={focused ? '适应分支' : '适应全图'}
        title={focused ? '适应分支' : '适应全图'}
        onClick={() => actions.current?.fit()}
      >
        {focused ? <Focus /> : <Maximize2 />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="重置视角"
        title="重置视角"
        onClick={() => actions.current?.reset()}
      >
        <Rotate3D />
      </Button>
    </div>
  )
}
