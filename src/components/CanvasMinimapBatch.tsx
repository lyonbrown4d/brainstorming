import { createContext, useContext, useMemo } from 'react'
import {
  MiniMap,
  useStore,
  useStoreApi,
  type MiniMapNodeProps,
  type MiniMapProps,
} from '@xyflow/react'
import {
  canBatchCanvasMinimap,
  canvasMinimapPathGroups,
  canvasMinimapRectangles,
  type MinimapPathGroup,
} from '@renderer/lib/canvasMinimapBatch'
import { CanvasMinimapImage } from '@renderer/components/CanvasMinimapImage'
import { canvasMinimapImageSource } from '@renderer/lib/canvasMinimapImage'

interface BatchPlan {
  readonly firstId: string
  readonly groups: readonly MinimapPathGroup[]
  readonly rectangles: ReturnType<typeof canvasMinimapRectangles>
}
const BatchContext = createContext<BatchPlan | null>(null)

const BatchNode = ({ id, shapeRendering }: MiniMapNodeProps) => {
  const plan = useContext(BatchContext)
  const imageSource = useMemo(
    () =>
      plan?.firstId === id && plan.groups.length > 32
        ? canvasMinimapImageSource(plan.groups, plan.rectangles, shapeRendering)
        : null,
    [id, plan, shapeRendering],
  )
  if (plan?.firstId !== id) return null
  const paths = plan.groups.map((group) => (
    <path
      key={group.id}
      className={`react-flow__minimap-node${group.selected ? ' selected' : ''}`}
      data-minimap-node-count={group.count}
      d={group.path}
      style={{ fill: group.fill, strokeWidth: 0 }}
      shapeRendering={shapeRendering}
      pointerEvents="none"
    />
  ))
  return imageSource ? <CanvasMinimapImage source={imageSource} fallback={paths} /> : paths
}

/** Only node snapshots rebuild geometry; official viewport changes update the mask independently. */
export const CanvasMinimapBatch = (props: MiniMapProps) => {
  const nodes = useStore((state) => state.nodes)
  const store = useStoreApi()
  const eligible = canBatchCanvasMinimap(nodes.length, props)
  const nodeColor = props.nodeColor
  const radius = props.nodeBorderRadius ?? 5
  const plan = useMemo(() => {
    if (!eligible) return null
    const rectangles = canvasMinimapRectangles(nodes, store.getState().nodeLookup)
    const firstId = rectangles[0]?.node.id
    if (rectangles.length < 250 || firstId === undefined) return null
    const groups = canvasMinimapPathGroups(rectangles, nodeColor, radius)
    return groups ? { firstId, groups, rectangles } : null
  }, [eligible, nodes, store, nodeColor, radius])
  return plan ? (
    <BatchContext value={plan}>
      <MiniMap {...props} nodeComponent={BatchNode} />
    </BatchContext>
  ) : (
    <MiniMap {...props} />
  )
}
