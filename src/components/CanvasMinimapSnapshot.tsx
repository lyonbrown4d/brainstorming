import { ReactFlowProvider, type MiniMapProps } from '@xyflow/react'
import { useCanvasMinimapSize } from '@renderer/hooks/useCanvasMinimapSize'
import { CanvasMinimapBatch } from '@renderer/components/CanvasMinimapBatch'
import {
  useCanvasMinimapSnapshot,
  type CanvasMinimapStore,
} from '@renderer/hooks/useCanvasMinimapSnapshot'

const Snapshot = ({ source, ...props }: MiniMapProps & { source: CanvasMinimapStore }) => {
  const element = useCanvasMinimapSnapshot(source)
  const size = useCanvasMinimapSize(element)
  return (
    <div ref={element}>
      <CanvasMinimapBatch {...props} style={{ ...props.style, ...size }} />
    </div>
  )
}

/** Keep MiniMap's synchronous store subscriptions out of the main canvas's frame. */
export const CanvasMinimapSnapshot = (props: MiniMapProps & { source: CanvasMinimapStore }) => (
  <ReactFlowProvider>
    <Snapshot {...props} />
  </ReactFlowProvider>
)
