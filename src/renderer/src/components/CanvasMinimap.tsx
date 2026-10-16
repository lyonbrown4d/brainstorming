import { MiniMap, Panel, type Node } from '@xyflow/react'
import { memo } from 'react'

const nodeColor = (node: Node): string => (node.selected ? '#8b79d9' : '#d9d1ed')
import { Map, X } from 'lucide-react'
import { useCanvasPreferences } from '../state/canvasPreferences'
import { Button } from './ui/button'

/** Use React Flow's viewport projection and interaction, without duplicating the graph. */
export const CanvasMinimap = memo(function CanvasMinimap() {
  const visible = useCanvasPreferences((state) => state.minimap)
  const setVisible = useCanvasPreferences((state) => state.setMinimap)
  return visible ? (
    <Panel position="bottom-left" className="!m-4">
      <MiniMap
        position="bottom-left"
        ariaLabel="画布缩略图"
        pannable
        zoomable
        nodeColor={nodeColor}
        nodeStrokeWidth={0}
        maskColor="rgba(250, 249, 253, 0.72)"
        className="!relative !bottom-auto !left-auto !m-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm max-sm:!h-24 max-sm:!w-36"
      />
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 z-10 size-6 rounded-md bg-background/90"
        aria-label="关闭缩略图"
        title="关闭缩略图"
        onClick={() => {
          setVisible(false)
        }}
      >
        <X className="size-3.5" />
      </Button>
    </Panel>
  ) : (
    <Panel position="bottom-left" className="!m-4">
      <Button
        variant="outline"
        size="icon"
        aria-label="显示缩略图"
        title="显示缩略图"
        onClick={() => {
          setVisible(true)
        }}
      >
        <Map className="size-4" />
      </Button>
    </Panel>
  )
})
