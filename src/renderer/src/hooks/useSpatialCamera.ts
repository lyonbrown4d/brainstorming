import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { usePresentation } from '../state/presentation'
import { useEditor } from '../state/editor'
import { useReducedMotion } from 'motion/react'
import { spatialBounds, type SpatialNode } from '../../../layout/spatial'
import type { SpatialCameraActions, SpatialCameraState } from '../components/spatial/types'

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
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const invalidate = useThree((state) => state.invalidate)
  const previousFrame = useRef<string | null>(null)
  const homeDistance = useRef(16)
  const animation = !reduceMotion

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
      const { center, distance } = spatialFrame(controller, nodes)
      homeDistance.current = distance
      if (reset) {
        const direction = new Vector3(0.15, 0.23, 1).normalize().multiplyScalar(distance)
        void controller.setLookAt(
          center.x + direction.x,
          center.y + direction.y,
          center.z + direction.z,
          center.x,
          center.y,
          center.z,
          transition,
        )
      } else {
        void controller.moveTo(center.x, center.y, center.z, transition)
        void controller.dollyTo(distance, transition)
      }
      invalidate()
    },
    [animation, controls, invalidate, nodes],
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
    const frame = `${structureKey}:${focusId ?? ''}:${width}:${height}`
    if (previousFrame.current === frame) return
    const first = previousFrame.current === null
    previousFrame.current = frame
    const controller = controls.current
    if (!controller) return
    if (first && initialCamera) {
      homeDistance.current = spatialFrame(controller, nodes).distance
      void controller.setLookAt(...initialCamera.position, ...initialCamera.target, false)
      invalidate()
    } else fit(first, !first && animation)
  }, [
    animation,
    controls,
    fit,
    focusId,
    height,
    initialCamera,
    invalidate,
    nodes,
    structureKey,
    width,
  ])

  useEffect(() => {
    if (cameraRequest?.sheetId !== useEditor.getState().activeSheetId) return
    const controller = controls.current
    if (!controller) return
    void controller.setLookAt(
      ...cameraRequest.camera.position,
      ...cameraRequest.camera.target,
      animation,
    )
    invalidate()
  }, [animation, cameraRequest, controls, invalidate])

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

  return { report, orient, smoothTime: reduceMotion ? 0 : 0.18 }
}

function spatialFrame(controller: CameraControlsImpl, nodes: readonly SpatialNode[]) {
  const bounds = spatialBounds(nodes)
  const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
  const size = box.getSize(new Vector3())
  // The canonical fit distance remains the zoom baseline after restoring a zoomed camera.
  const distance = Math.max(
    4,
    controller.getDistanceToFitBox(
      size.x * 1.22 + size.z * 0.35,
      size.y * 1.42 + size.z * 0.35,
      Math.max(size.z, 0.2),
    ),
  )
  return { center: box.getCenter(new Vector3()), distance }
}
