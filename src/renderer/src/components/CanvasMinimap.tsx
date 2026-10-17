import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { MiniMap, Panel, type Node } from '@xyflow/react'
import { memo } from 'react'

const nodeColor = (node: Node): string => (node.selected ? '#8b79d9' : '#d9d1ed')
import { Map, X } from 'lucide-react'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { Button } from '@renderer/components/ui/button'

/** Use React Flow's viewport projection and interaction, without duplicating the graph. */
export const CanvasMinimap = memo(() => {
  const visible = useCanvasPreferences((state) => state.minimap)
  const setVisible = useCanvasPreferences((state) => state.setMinimap)
  return (
    <CanvasOverlay className="z-[5]">
      {visible ? (
        <Panel position="bottom-left" className="pointer-events-auto !m-4 @max-[640px]:!bottom-32">
          <MiniMap
            position="bottom-left"
            ariaLabel="画布缩略图"
            pannable
            zoomable
            nodeColor={nodeColor}
            nodeStrokeWidth={0}
            maskColor="rgba(250, 249, 253, 0.72)"
            className="!relative !h-28 !w-44 !bottom-auto !left-auto !m-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm @max-[640px]:!h-20 @max-[640px]:!w-28"
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
        <Panel position="bottom-left" className="pointer-events-auto !m-4 @max-[640px]:!bottom-32">
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
      )}
    </CanvasOverlay>
  )
})

CanvasMinimap.displayName = 'CanvasMinimap'
