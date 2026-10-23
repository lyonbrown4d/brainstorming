import { useLayoutEffect, useRef } from 'react'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useIndependentSpatialScale } from '@renderer/hooks/useIndependentSpatialScale'
import { useSelection, useSelectedDrawingIds } from '@renderer/state/selection'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useEditor } from '@renderer/state/editor'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'

export const IndependentSpatialScale = ({
  runtime,
  ready,
}: {
  runtime: IndependentSpatialRuntime
  ready: boolean
}) => {
  const { translate } = useMessages()
  const sheetId = useEditor((state) => state.activeSheetId)
  const selected = useSelection((state) => state.sheets[sheetId])
  const drawings = useSelectedDrawingIds()
  const annotation = useAnnotationInteraction((state) => state.selected?.sheetId === sheetId)
  const primary = useEditor((state) => state.selectedId)
  const busy = useEditor((state) => state.busy || Boolean(state.editingId))
  const mode = useCanvasInk((state) => state.mode)
  const id =
    annotation || drawings.length
      ? undefined
      : selected
        ? selected.length === 1
          ? selected[0]
          : undefined
        : primary
  const target = useRef<HTMLDivElement>(null)
  const begin = useIndependentSpatialScale(runtime)
  useLayoutEffect(() => {
    const update = () => {
      const rect = id ? runtime.rectangle(id) : undefined
      const root = runtime.canvas?.getBoundingClientRect()
      if (!target.current) return
      target.current.hidden = !rect || !root || rect.width < 48 || rect.height < 28
      if (!rect || !root) return
      Object.assign(target.current.style, {
        transform: `translate(${rect.x - root.left}px,${rect.y - root.top}px)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
    }
    update()
    return runtime.subscribe(update)
  }, [runtime, id, primary, ready, busy, mode])
  if (!id || busy || !ready || mode !== 'select') return null
  const labels = {
    'top-left': translate('scaleTopicTopLeft'),
    'top-right': translate('scaleTopicTopRight'),
    'bottom-left': translate('scaleTopicBottomLeft'),
    'bottom-right': translate('scaleTopicBottomRight'),
  }
  return (
    <div ref={target} className="pointer-events-none absolute top-0 left-0 z-20" data-spatial-scale>
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
        <Button
          key={corner}
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
