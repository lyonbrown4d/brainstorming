import { Focus, Maximize2, Minus, Plus, Rotate3D } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '../ui/button'
import type { SpatialCameraActions } from './types'

export function SpatialControls({
  actions,
  focused,
  zoom,
}: {
  actions: RefObject<SpatialCameraActions | null>
  focused: boolean
  zoom: number
}) {
  return (
    <>
      <p className="pointer-events-none absolute bottom-7 left-1/2 z-20 hidden -translate-x-1/2 text-xs text-muted-foreground xl:block">
        双指平移 · 捏合缩放 · Alt+双指旋转 · 双击编辑
      </p>
      <div
        className="absolute right-5 bottom-5 z-30 flex items-center gap-2 text-muted-foreground"
        role="group"
        aria-label="3D 画布视图"
      >
        <div className="flex h-10 items-center rounded-xl border border-border/80 bg-background/95 p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="缩小 3D 画布"
            onClick={() => actions.current?.zoom('out')}
          >
            <Minus />
          </Button>
          <output className="min-w-12 text-center text-xs tabular-nums" aria-label="3D 缩放比例">
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
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl bg-background/95 shadow-sm"
          onClick={() => actions.current?.fit()}
        >
          {focused ? <Focus /> : <Maximize2 />}
          {focused ? '适应分支' : '适应全图'}
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-xl bg-background/95 shadow-sm"
          onClick={() => actions.current?.reset()}
        >
          <Rotate3D />
          <span className="hidden sm:inline">重置视角</span>
        </Button>
      </div>
    </>
  )
}
