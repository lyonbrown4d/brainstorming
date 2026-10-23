import { NodeResizeControl, useStore } from '@xyflow/react'
import type { Topic } from '@core'
import { useTopicScaleResize } from '@renderer/hooks/useTopicScaleResize'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useMessages } from '@renderer/i18n/useMessages'

export const TopicScaleHandle = ({
  id,
  topic,
  selected,
}: {
  id: string
  topic: Topic
  selected: boolean
}) => {
  const { translate } = useMessages()
  const { resize, setCorner } = useTopicScaleResize(id, topic)
  const mode = useCanvasInk((state) => state.mode)
  const sheetId = useEditor((state) => state.activeSheetId)
  const annotation = useAnnotationInteraction((state) => state.selected?.sheetId === sheetId)
  const busy = useEditor((state) => state.busy)
  const editing = useEditor((state) => Boolean(state.editingId))
  const playing = usePresentation((state) => state.playing)
  // Screen-sized grips must leave a usable drag target at overview distances.
  const usable = useStore((state) => {
    const node = state.nodeLookup.get(id)
    const zoom = state.transform[2]
    return (
      (node?.measured.width ?? node?.width ?? 0) * zoom >= 48 &&
      (node?.measured.height ?? node?.height ?? 0) * zoom >= 28
    )
  })
  if (!usable || !selected || annotation || busy || editing || playing || mode !== 'select')
    return null
  const labels = {
    'top-left': translate('scaleTopicTopLeft'),
    'top-right': translate('scaleTopicTopRight'),
    'bottom-left': translate('scaleTopicBottomLeft'),
    'bottom-right': translate('scaleTopicBottomRight'),
  }
  return (
    <>
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
        <NodeResizeControl
          key={corner}
          {...resize}
          onResizeStart={(event, params) => {
            setCorner(corner)
            resize.onResizeStart?.(event, params)
          }}
          position={corner}
          keepAspectRatio
          className={`topic-scale-control topic-scale-${corner} nodrag nopan !z-20 !size-4 !rounded-[5px] !border-2 !border-background !bg-ring shadow-sm hover:!bg-primary motion-reduce:transition-none`}
          style={{ pointerEvents: 'all' }}
        >
          <span className="sr-only" title={labels[corner]}>
            {labels[corner]}
          </span>
        </NodeResizeControl>
      ))}
    </>
  )
}
