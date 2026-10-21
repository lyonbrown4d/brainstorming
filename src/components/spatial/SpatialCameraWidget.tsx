import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube } from '@react-three/drei'
import { useAppearanceColors } from '@renderer/hooks/useAppearanceColors'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasInk } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { spatialCameraQuaternion } from '@renderer/lib/spatialCamera'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { getSpatialView, useSpatialView } from '@renderer/state/spatialView'

const CameraSync = ({
  workbookId,
  sheetId,
  onReady,
}: {
  workbookId: string
  sheetId: string
  onReady: () => void
}) => {
  const { camera, invalidate } = useThree()
  const reported = useRef(false)
  const readyFrame = useRef(0)
  useLayoutEffect(() => {
    let yaw: number | undefined
    let pitch: number | undefined
    const update = (): void => {
      const view = getSpatialView(workbookId, sheetId)
      if (view.yaw === yaw && view.pitch === pitch) return
      yaw = view.yaw
      pitch = view.pitch
      const rotation = spatialCameraQuaternion(view)
      camera.position.set(0, 0, 5).applyQuaternion(rotation)
      camera.quaternion.copy(rotation)
      camera.updateMatrixWorld()
      invalidate()
    }
    update()
    const stopView = useSpatialView.subscribe(update)
    const stopEditor = useEditor.subscribe(update)
    return () => {
      stopView()
      stopEditor()
    }
  }, [camera, invalidate, workbookId, sheetId])
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

/** Drei's direction cube mirrors the document camera and dispatches view presets. */
export const SpatialCameraWidget = ({
  disabled = false,
  onReady,
}: {
  disabled?: boolean
  onReady: () => void
}) => {
  const { translate } = useMessages()
  const { workbookId, sheetId, value: mode } = useActiveSpatialSetting((view) => view.mode)
  const colors = useAppearanceColors()
  const busy = useEditor((state) => state.busy || Boolean(state.editingId))
  const drawing = useCanvasInk((state) => state.mode !== 'select')
  const playing = usePresentation((state) => state.playing)
  const [lost, setLost] = useState(false)
  if (mode !== '3d') return null
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
          <CameraSync workbookId={workbookId} sheetId={sheetId} onReady={onReady} />
          <GizmoHelper alignment="center-center" margin={[0, 0]}>
            <GizmoViewcube
              faces={[
                translate('spatialRight'),
                translate('spatialLeft'),
                translate('spatialTop'),
                translate('spatialBottom'),
                translate('spatialFront'),
                translate('spatialBack'),
              ]}
              color={colors.surface}
              hoverColor={colors.primary}
              textColor={colors.foreground}
              strokeColor={colors.foreground}
              font="bold 16px system-ui, sans-serif"
              onClick={(event) => {
                event.stopPropagation()
                if (disabled || busy || drawing || playing) return null
                const direction = event.object.position.clone()
                if (direction.lengthSq() < 0.01 && event.face) direction.copy(event.face.normal)
                if (direction.lengthSq() < 0.01) return null
                direction.normalize()
                saveSpatialView({
                  yaw: Math.atan2(direction.x, direction.z),
                  pitch: Math.asin(Math.max(-1, Math.min(1, direction.y))),
                })
                return null
              }}
            />
          </GizmoHelper>
        </Canvas>
      </div>
    </ErrorBoundary>
  )
}
