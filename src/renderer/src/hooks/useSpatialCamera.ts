import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { usePresentation } from '../state/presentation'
import { useViewportRequest } from '../state/viewport'
import { useEditor } from '../state/editor'
import { useReducedMotion } from 'motion/react'
import { spatialBounds, type SpatialNode } from '../../../layout/spatial'
import type { SpatialCameraActions, SpatialCameraState } from '../components/spatial/types'
import {
  spatialFramingTarget,
  spatialSafeViewport,
  type ViewportBounds,
} from '../lib/spatialSafeViewport'

interface SpatialCameraOptions {
  readonly controls: RefObject<CameraControlsImpl | null>
  readonly actions: RefObject<SpatialCameraActions | null>
  readonly nodes: readonly SpatialNode[]
  readonly structureKey: string
  readonly focusId: string | null
  readonly initialCamera: SpatialCameraState | undefined
  readonly onCameraChange: (camera: SpatialCameraState) => void
  readonly onZoomChange: (zoom: number) => void
}

/** Synchronizes a mature camera controller with document framing and persisted view state. */
export function useSpatialCamera({
  controls,
  actions,
  nodes,
  structureKey,
  focusId,
  initialCamera,
  onCameraChange,
  onZoomChange,
}: SpatialCameraOptions) {
  const cameraRequest = usePresentation((state) => state.cameraRequest)
  const reduceMotion = useReducedMotion()
  const invalidate = useThree((state) => state.invalidate)
  const get = useThree((state) => state.get)
  const previousFrame = useRef<string | null>(null)
  const homeDistance = useRef(16)
  const framing = useRef(false)
  const frameRevision = useRef(0)
  const animation = !reduceMotion
  const duringFrame = useCallback((requests: readonly Promise<void>[]) => {
    const revision = ++frameRevision.current
    framing.current = true
    const finish = () => {
      if (frameRevision.current === revision) framing.current = false
    }
    void Promise.all(requests).then(finish, finish)
  }, [])

  const report = useCallback(() => {
    const controller = controls.current
    if (!controller) return
    const position = controller.getPosition(new Vector3())
    const target = controller.getTarget(new Vector3())
    onCameraChange({
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
    })
    onZoomChange(Math.max(1, Math.round((homeDistance.current / controller.distance) * 100)))
  }, [controls, onCameraChange, onZoomChange])

  const fit = useCallback(
    (reset = false, transition = animation) => {
      const controller = controls.current
      if (!controller || nodes.length === 0) return
      const viewport = get().size
      const { center, distance, safe } = spatialFrame(controller, nodes, viewport)
      homeDistance.current = distance
      const direction = reset ? new Vector3(0.15, 0.23, 1).normalize() : undefined
      const target = spatialFramingTarget(
        controller.camera,
        center,
        distance,
        viewport,
        safe,
        direction,
      )
      if (direction) {
        const offset = direction.multiplyScalar(distance)
        duringFrame([
          controller.setLookAt(
            target.x + offset.x,
            target.y + offset.y,
            target.z + offset.z,
            target.x,
            target.y,
            target.z,
            transition,
          ),
        ])
      } else {
        duringFrame([
          controller.moveTo(target.x, target.y, target.z, transition),
          controller.dollyTo(distance, transition),
        ])
      }
      invalidate()
    },
    [animation, controls, duringFrame, get, invalidate, nodes],
  )

  const orient = useCallback(
    (direction: Vector3) => {
      const controller = controls.current
      if (!controller) return
      const facing = direction.clone().normalize()
      const azimuth = Math.max(-1.12, Math.min(1.12, Math.atan2(facing.x, Math.max(0.3, facing.z))))
      const polar = Math.max(0.55, Math.min(1.82, Math.acos(facing.y)))
      void controller.rotateTo(azimuth, polar, animation)
      invalidate()
    },
    [animation, controls, invalidate],
  )

  useEffect(() => {
    const frame = `${structureKey}:${focusId ?? ''}`
    if (previousFrame.current === frame) return
    const first = previousFrame.current === null
    const controller = controls.current
    if (!controller || nodes.length === 0) return
    previousFrame.current = frame
    if (first && initialCamera) {
      homeDistance.current = spatialFrame(controller, nodes, get().size).distance
      duringFrame([controller.setLookAt(...initialCamera.position, ...initialCamera.target, false)])
      invalidate()
    } else fit(first, !first && animation)
  }, [
    animation,
    controls,
    duringFrame,
    fit,
    focusId,
    get,
    initialCamera,
    invalidate,
    nodes,
    structureKey,
  ])

  useEffect(() => {
    if (cameraRequest?.sheetId !== useEditor.getState().activeSheetId) return
    const controller = controls.current
    if (!controller) return
    duringFrame([
      controller.setLookAt(
        ...cameraRequest.camera.position,
        ...cameraRequest.camera.target,
        animation,
      ),
    ])
    invalidate()
  }, [animation, cameraRequest, controls, duringFrame, invalidate])

  useEffect(() => {
    actions.current = {
      fit: () => {
        fit()
      },
      reset: () => {
        fit(true)
      },
      zoom: (direction) => {
        const controller = controls.current
        if (!controller) return
        void controller.dolly(controller.distance * (direction === 'in' ? 0.18 : -0.22), animation)
        invalidate()
      },
    }
    return () => {
      actions.current = null
    }
  }, [actions, animation, controls, fit, invalidate])

  useEffect(
    () =>
      useViewportRequest.subscribe(({ action }) => {
        if (action === 'zoomIn' || action === 'zoomOut')
          actions.current?.zoom(action === 'zoomIn' ? 'in' : 'out')
        else if (action === 'actualSize' || action === 'centerRoot') actions.current?.fit()
      }),
    [actions],
  )

  return { report, orient, framing, smoothTime: reduceMotion ? 0 : 0.18 }
}

function spatialFrame(
  controller: CameraControlsImpl,
  nodes: readonly SpatialNode[],
  viewport: ViewportBounds,
) {
  const bounds = spatialBounds(nodes)
  const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
  const size = box.getSize(new Vector3())
  const editor = useEditor.getState()
  const playing = usePresentation.getState().playing
  const safe = spatialSafeViewport(
    viewport,
    !playing && editor.outlineOpen,
    !playing && editor.inspectorOpen,
  )
  // The canonical fit distance remains the zoom baseline after restoring a zoomed camera.
  const distance = Math.max(
    4,
    controller.getDistanceToFitBox(
      ((size.x * 1.08 + size.z * 0.25) * viewport.width) / Math.max(1, safe.width),
      size.y * 1.25 + size.z * 0.25,
      Math.max(size.z, 0.2),
    ),
  )
  return { center: box.getCenter(new Vector3()), distance, safe }
}
