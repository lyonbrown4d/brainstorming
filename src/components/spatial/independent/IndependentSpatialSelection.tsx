import { createPortal } from 'react-dom'
import type { IndependentSpatialGestureOverlay } from '@renderer/hooks/useIndependentSpatialGestures'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'

/** Client coordinates remain aligned even while the canvas is inset by workspace panels. */
export const IndependentSpatialSelection = ({
  marquee,
  dropLine,
}: IndependentSpatialGestureOverlay) => {
  const drag = useCanvasInteraction((state) => state.drag)
  const drop = drag?.drop
  const source = drag?.roots[0]
  return createPortal(
    <svg
      className="pointer-events-none fixed inset-0 z-20 h-screen w-screen overflow-visible"
      aria-hidden="true"
      data-testid={drop ? 'drop-preview' : undefined}
      data-parent-id={drop?.parentId}
      data-target-id={drop?.targetId}
      data-drop-predicted={drop?.predicted === true}
    >
      {marquee && (
        <rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.width}
          height={marquee.height}
          className="fill-primary/10 stroke-primary"
          strokeWidth={1}
        />
      )}
      {dropLine && (
        <line
          x1={dropLine.from.x}
          y1={dropLine.from.y}
          x2={dropLine.to.x}
          y2={dropLine.to.y}
          className="stroke-primary"
          strokeWidth={2}
          strokeDasharray="5 4"
          data-testid={drop && source ? `drop-preview-connection-${source}` : undefined}
          data-parent-id={drop?.parentId}
        />
      )}
    </svg>,
    document.body,
  )
}
