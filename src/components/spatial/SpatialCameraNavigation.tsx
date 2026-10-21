import { useEffect, useState } from 'react'
import { Panel, useStore } from '@xyflow/react'
import { useSpatialCameraGesture } from '@renderer/hooks/useSpatialCameraGesture'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { SpatialCameraWidget } from '@renderer/components/spatial/SpatialCameraWidget'
import type { MindMapLayout } from '@layout'
import type { CanvasStroke } from '@core'

/** Native controls attach to the pane itself so topic and ink nodes keep their pointer events. */
export const SpatialCameraNavigation = ({
  disabled = false,
  onReady,
  layout,
  depths,
  drawings,
}: {
  disabled?: boolean
  onReady: () => void
  layout?: MindMapLayout | undefined
  depths?: Readonly<Record<string, number>> | null | undefined
  drawings?: readonly CanvasStroke[] | undefined
}) => {
  const domNode = useStore((state) => state.domNode)
  const [pane, setPane] = useState<HTMLDivElement | null>(null)
  const busy = useEditor((state) => state.busy)
  const editing = useEditor((state) => Boolean(state.editingId))
  const inkMode = useCanvasInk((state) => state.mode)
  const playing = usePresentation((state) => state.playing)
  const selectedId = useEditor((state) => state.selectedId)
  const rootId = useEditor((state) => state.history.document.rootId)
  const available = !disabled && !busy && !editing && inkMode === 'select' && !playing
  useSpatialCameraGesture(pane, domNode, available, {
    layout,
    depths,
    drawings,
    selectedId,
    rootId,
  })

  useEffect(() => {
    if (!domNode) return
    const findPane = (): void => {
      setPane(domNode.querySelector<HTMLDivElement>('.react-flow__pane'))
    }
    findPane()
    const observer = new MutationObserver(findPane)
    observer.observe(domNode, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [domNode])

  return (
    <Panel position="top-right" className="!m-3">
      <SpatialCameraWidget disabled={!available} onReady={onReady} />
    </Panel>
  )
}
