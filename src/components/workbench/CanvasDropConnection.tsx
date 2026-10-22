import { getBezierPath, Position, useInternalNode } from '@xyflow/react'
import type { TopicFlowNode } from '@renderer/components/TopicNode'

/** Only the two endpoints subscribe to moving geometry; no global edge projection per frame. */
export const CanvasDropConnection = ({
  rootId,
  parentId,
}: {
  rootId: string
  parentId: string
}) => {
  const moving = useInternalNode<TopicFlowNode>(rootId)
  const parent = useInternalNode<TopicFlowNode>(parentId)
  if (!moving || !parent) return null
  const sourceWidth = parent.measured.width ?? parent.width ?? 160
  const sourceHeight = parent.measured.height ?? parent.height ?? 48
  const targetWidth = moving.measured.width ?? moving.width ?? 160
  const targetHeight = moving.measured.height ?? moving.height ?? 48
  const source = {
    x: parent.internals.positionAbsolute.x + sourceWidth / 2,
    y: parent.internals.positionAbsolute.y + sourceHeight / 2,
  }
  const target = {
    x: moving.internals.positionAbsolute.x + targetWidth / 2,
    y: moving.internals.positionAbsolute.y + targetHeight / 2,
  }
  const horizontal = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y)
  const forward = horizontal ? target.x >= source.x : target.y >= source.y
  const [path] = getBezierPath({
    sourceX: source.x + (horizontal ? ((forward ? 1 : -1) * sourceWidth) / 2 : 0),
    sourceY: source.y + (horizontal ? 0 : ((forward ? 1 : -1) * sourceHeight) / 2),
    targetX: target.x + (horizontal ? ((forward ? -1 : 1) * targetWidth) / 2 : 0),
    targetY: target.y + (horizontal ? 0 : ((forward ? -1 : 1) * targetHeight) / 2),
    sourcePosition: horizontal
      ? forward
        ? Position.Right
        : Position.Left
      : forward
        ? Position.Bottom
        : Position.Top,
    targetPosition: horizontal
      ? forward
        ? Position.Left
        : Position.Right
      : forward
        ? Position.Top
        : Position.Bottom,
  })
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[1000] size-px overflow-visible"
    >
      <path
        data-testid={`drop-preview-connection-${rootId}`}
        data-parent-id={parentId}
        d={path}
        fill="none"
        className="stroke-drop-target"
        strokeWidth={2}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
