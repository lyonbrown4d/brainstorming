import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Panel, useStore } from '@xyflow/react'
import { useSpatialCameraGesture } from '@renderer/hooks/useSpatialCameraGesture'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useSpatialNavigation } from '@renderer/state/spatialNavigation'
import { SpatialCameraWidget } from '@renderer/components/spatial/SpatialCameraWidget'

/** Portal the native OrbitControls surface into this React Flow instance only. */
export const SpatialCameraNavigation = ({
  disabled = false,
  onReady,
}: {
  disabled?: boolean
  onReady: () => void
}) => {
  const domNode = useStore((state) => state.domNode)
  const [pane, setPane] = useState<Element | null>(null)
  const [surface, setSurface] = useState<HTMLDivElement | null>(null)
  const [alt, setAlt] = useState(false)
  const orbit = useSpatialNavigation((state) => state.orbit)
  const busy = useEditor((state) => state.busy)
  const editing = useEditor((state) => Boolean(state.editingId))
  const inkMode = useCanvasInk((state) => state.mode)
  const playing = usePresentation((state) => state.playing)
  const available = !disabled && !busy && !editing && inkMode === 'select' && !playing
  const dragging = useSpatialCameraGesture(surface, available && (orbit || alt))
  const active = available && (orbit || alt || dragging)

  useEffect(() => {
    if (!domNode) return
    const findPane = (): void => {
      setPane(domNode.querySelector('.react-flow__pane'))
    }
    findPane()
    const observer = new MutationObserver(findPane)
    observer.observe(domNode, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [domNode])
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && !event.isComposing) setAlt(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') setAlt(false)
    }
    const blur = (): void => {
      setAlt(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return (
    <>
      {pane &&
        createPortal(
          <div
            ref={setSurface}
            data-spatial-camera-surface
            className="absolute inset-0 z-10"
            style={{ pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }}
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation()
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
            }}
          />,
          pane,
        )}
      <Panel position="top-right" className="!m-3">
        <SpatialCameraWidget disabled={!available} onReady={onReady} />
      </Panel>
    </>
  )
}
