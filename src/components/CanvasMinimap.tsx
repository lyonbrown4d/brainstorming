import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useMessages } from '@renderer/i18n/useMessages'

import { topicAppearance, documentAppearance } from '@shared/appearance'
import { useEditor } from '@renderer/state/editor'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { Panel, useStoreApi, type Node } from '@xyflow/react'
import { CanvasMinimapSnapshot } from '@renderer/components/CanvasMinimapSnapshot'
import { memo } from 'react'

const nodeColor = (node: Node): string => {
  if (node.type === 'ink') {
    const stroke = node.data.stroke
    if (
      stroke &&
      typeof stroke === 'object' &&
      'color' in stroke &&
      typeof stroke.color === 'string'
    )
      return stroke.color
  }
  const document = useEditor.getState().history.document
  const appearance = topicAppearance(document, node.id)
  return node.id === document.rootId ? appearance.fill : appearance.stroke
}
import { Map, X } from 'lucide-react'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { Button } from '@renderer/components/ui/button'

/** Defer the overview while React Flow renders the main canvas immediately. */
export const CanvasMinimap = memo(() => {
  const { translate } = useMessages()
  const source = useStoreApi()

  const colors = useAppearanceColors()
  const document = useEditor((state) => state.history.document)
  const visible = useCanvasPreferences((state) => state.minimap)
  const setVisible = useCanvasPreferences((state) => state.setMinimap)
  return (
    <CanvasOverlay className="z-[5]">
      {visible ? (
        <Panel position="bottom-left" className="pointer-events-auto !m-4 @max-[640px]:!bottom-32">
          <CanvasMinimapSnapshot
            source={source}
            position="bottom-left"
            ariaLabel={translate('canvasMinimap')}
            pannable
            zoomable
            nodeColor={nodeColor}
            nodeStrokeWidth={0}
            maskColor={`${documentAppearance(document, colors.canvas).background}b8`}
            bgColor={documentAppearance(document, colors.canvas).background}
            className="!relative !h-28 !w-44 !bottom-auto !left-auto !m-0 overflow-hidden rounded-lg border border-border/80 bg-background @max-[640px]:!h-20 @max-[640px]:!w-28"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 z-10 size-6 rounded-md bg-background text-muted-foreground"
            aria-label={translate('hideMinimap')}
            title={translate('hideMinimap')}
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
            className="size-8 rounded-lg bg-background text-muted-foreground shadow-none"
            aria-label={translate('showMinimap')}
            title={translate('showMinimap')}
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
