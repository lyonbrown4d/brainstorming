import { NodeResizeControl } from '@xyflow/react'
import type { Topic } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useTopicWidthResize } from '@renderer/hooks/useTopicWidthResize'

export const TopicWidthHandles = ({
  id,
  topic,
  selected,
}: {
  id: string
  topic: Topic
  selected: boolean
}) => {
  const { translate } = useMessages()
  const resize = useTopicWidthResize(id, topic)
  const mode = useCanvasInk((state) => state.mode)
  const busy = useEditor((state) => state.busy)
  const editing = useEditor((state) => Boolean(state.editingId))
  const playing = usePresentation((state) => state.playing)
  if (!selected || busy || editing || playing || mode !== 'select') return null
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <NodeResizeControl
          key={side}
          {...resize}
          position={side}
          resizeDirection="horizontal"
          minWidth={80}
          maxWidth={1200}
          className="nodrag nopan !top-[78%] !z-20 !size-3.5 !rounded-full !border-2 !border-background !bg-primary shadow-sm"
          style={{ pointerEvents: 'all' }}
        >
          <span
            className="sr-only"
            title={translate(side === 'left' ? 'resizeTopicFromLeft' : 'resizeTopicFromRight')}
          >
            {translate(side === 'left' ? 'resizeTopicFromLeft' : 'resizeTopicFromRight')}
          </span>
        </NodeResizeControl>
      ))}
    </>
  )
}
