import { NodeResizeControl, NodeToolbar, useStore } from '@xyflow/react'
import { useTopicWidthResize } from '@renderer/hooks/useTopicWidthResize'
import { useTopicDirectControls } from '@renderer/hooks/useTopicDirectControls'
import { TopicNearbyAdd } from '@renderer/components/TopicNearbyAdd'
import { useMessages } from '@renderer/i18n/useMessages'
import { useTopicWidthPreview } from '@renderer/state/topicWidthPreview'
import { useTopicScalePreview } from '@renderer/state/topicScalePreview'
import { useTopicNearbyPlacement } from '@renderer/hooks/useTopicNearbyPlacement'
import { TOPIC_NEARBY_GAP } from '@renderer/lib/topicNearbyPlacement'

export const TopicWidthHandle = ({ id, scale }: { id: string; scale: number }) => {
  const { translate } = useMessages()
  const eligible = useTopicDirectControls()
  const { resize, setSide } = useTopicWidthResize(id)
  const resizing = useTopicWidthPreview((state) => Boolean(state.preview))
  const scaling = useTopicScalePreview((state) => Boolean(state.topicId))
  const placement = useTopicNearbyPlacement(eligible === id ? id : undefined)
  const usable = useStore((state) => {
    const node = state.nodeLookup.get(id)
    return (
      !node?.dragging &&
      (node?.measured.width ?? 0) * state.transform[2] >= 64 &&
      (node?.measured.height ?? 0) * state.transform[2] >= 40
    )
  })
  if (eligible !== id || !usable) return null
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <NodeResizeControl
          key={side}
          {...resize}
          onResizeStart={(event, params) => {
            setSide(side)
            resize.onResizeStart?.(event, params)
          }}
          position={side}
          resizeDirection="horizontal"
          minWidth={80 * scale}
          maxWidth={1200 * scale}
          className={`topic-width-control topic-width-${side} nodrag nopan !z-30 !h-6 !w-2 !cursor-ew-resize !rounded-full !border-2 !border-background !bg-ring shadow-sm`}
          style={{ pointerEvents: 'all', marginLeft: side === 'left' ? -18 : 18 }}
        >
          <span
            className="sr-only"
            title={translate(side === 'left' ? 'resizeTopicWidthLeft' : 'resizeTopicWidth')}
          >
            {translate(side === 'left' ? 'resizeTopicWidthLeft' : 'resizeTopicWidth')}
          </span>
        </NodeResizeControl>
      ))}
      <NodeToolbar
        isVisible={Boolean(placement) && !resizing && !scaling}
        {...(placement ? { position: placement } : {})}
        offset={TOPIC_NEARBY_GAP}
        style={{ pointerEvents: 'none' }}
      >
        <TopicNearbyAdd id={id} />
      </NodeToolbar>
    </>
  )
}
