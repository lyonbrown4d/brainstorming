import { ViewportPortal } from '@xyflow/react'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useInkDrawing } from '@renderer/hooks/useInkDrawing'
import { useMessages } from '@renderer/i18n/useMessages'

export const CanvasInk = () => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  const playing = usePresentation((state) => state.playing)
  const mode = useCanvasInk((state) => state.mode)
  const { preview, ...pointer } = useInkDrawing()
  const active = mode !== 'select' && !busy && !playing
  return (
    <>
      <ViewportPortal>
        <svg
          data-canvas-drawings
          className="pointer-events-none absolute top-0 left-0 h-px w-px overflow-visible"
          aria-hidden
        >
          <path ref={preview} />
        </svg>
      </ViewportPortal>
      {active && mode === 'pen' && (
        <div
          {...pointer}
          className="absolute inset-0 z-[5] touch-none cursor-crosshair"
          data-canvas-ink
          role="presentation"
        />
      )}
      {active && (
        <p className="pointer-events-none absolute inset-x-4 bottom-20 z-10 mx-auto w-fit rounded-lg border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground">
          {translate(mode === 'pen' ? 'inkHint' : 'inkEraseHint')}
        </p>
      )}
    </>
  )
}
