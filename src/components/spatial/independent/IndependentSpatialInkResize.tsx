import { independentSpatialInkIdentity } from '@renderer/lib/independentSpatialInkIdentity'
import { useLayoutEffect, useRef } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useIndependentSpatialInkResize } from '@renderer/hooks/useIndependentSpatialInkResize'
import { useSelectedIds, useSelectedDrawingIds } from '@renderer/state/selection'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'

export const IndependentSpatialInkResize = ({
  runtime,
  ready,
}: {
  runtime: IndependentSpatialRuntime
  ready: boolean
}) => {
  const { translate } = useMessages()
  const drawings = useSelectedDrawingIds(),
    topics = useSelectedIds()
  const busy = useEditor((state) => state.busy || Boolean(state.editingId))
  const mode = useCanvasInk((state) => state.mode)
  const id = topics.length === 0 && drawings.length === 1 ? drawings[0] : undefined
  const host = useRef<HTMLDivElement>(null)
  const begin = useIndependentSpatialInkResize(runtime)
  useLayoutEffect(() => {
    const update = () => {
      const key = id
        ? independentSpatialInkIdentity(runtime.model.document).byDrawing.get(id)
        : null
      const rect = key ? runtime.rectangle(key) : null
      const viewport = runtime.canvas?.getBoundingClientRect()
      if (!host.current) return
      host.current.hidden = !rect || !viewport
      if (!rect || !viewport) return
      Object.assign(host.current.style, {
        transform: `translate(${rect.x - viewport.left}px,${rect.y - viewport.top}px)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
    }
    update()
    return runtime.subscribe(update)
  }, [runtime, id, ready, busy, mode])
  if (!ready || busy || !id || mode !== 'select') return null
  const labels = {
    'top-left': translate('inkResizeTopLeft'),
    'top-right': translate('inkResizeTopRight'),
    'bottom-left': translate('inkResizeBottomLeft'),
    'bottom-right': translate('inkResizeBottomRight'),
  }
  return (
    <div
      ref={host}
      data-spatial-ink-resize
      className="pointer-events-none absolute top-0 left-0 z-20"
    >
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
        <Button
          key={corner}
          data-testid={`ink-resize-${corner}`}
          variant="outline"
          size="icon"
          aria-label={labels[corner]}
          className={`pointer-events-auto absolute size-4 rounded-[5px] border-2 border-background bg-ring shadow-sm transition-none ${corner.startsWith('top') ? '-top-2' : '-bottom-2'} ${corner.endsWith('left') ? '-left-2 cursor-nwse-resize' : '-right-2 cursor-nesw-resize'}`}
          onPointerDown={(event) => {
            begin(event, id, corner)
          }}
        />
      ))}
    </div>
  )
}
