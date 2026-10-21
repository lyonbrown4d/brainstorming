import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Vector3 } from 'three'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
import { saveSpatialView } from '@renderer/state/spatialActions'
import type { SpatialView } from '@renderer/state/spatialView'

const CameraSync = ({ view, onReady }: { view: SpatialView; onReady: () => void }) => {
  const { camera, invalidate } = useThree()
  const reported = useRef(false)
  const readyFrame = useRef(0)
  useLayoutEffect(() => {
    const rotation = spatialCameraQuaternion(view)
    camera.position.copy(new Vector3(0, 0, 5).applyQuaternion(rotation))
    camera.quaternion.copy(rotation)
    camera.updateMatrixWorld()
    invalidate()
  }, [camera, invalidate, view])
  useFrame(() => {
    if (reported.current) return
    reported.current = true
    readyFrame.current = requestAnimationFrame(onReady)
  })
  useEffect(
    () => () => {
      cancelAnimationFrame(readyFrame.current)
    },
    [],
  )
  return null
}

const WidgetUnavailable = ({ onReady }: { onReady: () => void }) => {
  const { translate } = useMessages()
  useEffect(onReady, [onReady])
  return (
    <div
      className="grid size-28 place-items-center rounded-xl border border-border/80 bg-background p-2 text-center text-[11px] leading-4 text-muted-foreground"
      role="status"
    >
      {translate('spatialCameraWidgetUnavailable')}
    </div>
  )
}

/** Drei's standard viewport gizmo mirrors the saved orthographic camera. */
export const SpatialCameraWidget = ({
  disabled = false,
  onReady,
}: {
  disabled?: boolean
  onReady: () => void
}) => {
  const { translate } = useMessages()
  const { view } = useActiveSpatialView()
  const colors = useAppearanceColors()
  const busy = useEditor((state) => state.busy || Boolean(state.editingId))
  const drawing = useCanvasInk((state) => state.mode !== 'select')
  const playing = usePresentation((state) => state.playing)
  const [lost, setLost] = useState(false)
  if (view.mode !== '3d') return null
  if (lost) return <WidgetUnavailable onReady={onReady} />
  return (
    <ErrorBoundary fallbackRender={() => <WidgetUnavailable onReady={onReady} />}>
      <div
        className="size-28 overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm"
        aria-label={translate('spatialCameraWidget')}
        title={translate('spatialCameraWidget')}
        aria-disabled={disabled}
        style={{ pointerEvents: disabled ? 'none' : 'auto' }}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          fallback={<span className="sr-only">{translate('spatialCameraWidgetUnavailable')}</span>}
          camera={{ position: [0, 0, 5], fov: 50 }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault()
                setLost(true)
              },
              { once: true },
            )
          }}
        >
          <CameraSync view={view} onReady={onReady} />
          <GizmoHelper alignment="center-center" margin={[0, 0]}>
            <GizmoViewport
              disabled={disabled || busy || drawing || playing}
              axisColors={[colors.primary, colors.dropTarget, colors.foreground]}
              labelColor={colors.surface}
              font="bold 18px system-ui, sans-serif"
              onClick={(event) => {
                const point = event.object.position
                const axis = [Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)]
                if ((axis[0] ?? 0) > 0.5)
                  saveSpatialView({ yaw: point.x > 0 ? Math.PI / 2 : -Math.PI / 2, pitch: 0 })
                else if ((axis[1] ?? 0) > 0.5)
                  saveSpatialView({ yaw: 0, pitch: point.y > 0 ? Math.PI / 2 : -Math.PI / 2 })
                else if ((axis[2] ?? 0) > 0.5)
                  saveSpatialView({ yaw: point.z > 0 ? 0 : Math.PI, pitch: 0 })
                return null
              }}
            />
          </GizmoHelper>
        </Canvas>
      </div>
    </ErrorBoundary>
  )
}
