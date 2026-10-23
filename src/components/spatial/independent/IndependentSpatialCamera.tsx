import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { PerspectiveCamera } from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { attachIndependentSpatialCamera } from '@renderer/lib/independentSpatialCameraAttachment'
import { createIndependentSpatialCameraController } from '@renderer/lib/independentSpatialCameraController'

/** Attach CameraControls to the actual R3F perspective camera and demand-driven render loop. */
export const IndependentSpatialCamera = ({
  runtime,
  disabled,
  onReady,
}: {
  readonly runtime: IndependentSpatialRuntime
  readonly disabled: boolean
  readonly onReady: () => void
}) => {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)
  const reducedMotion = useReducedMotion()
  const disabledRef = useRef(disabled)
  const readyRef = useRef(onReady)
  const controller = useRef<ReturnType<typeof createIndependentSpatialCameraController>>(null)
  const readyFrame = useRef(0)
  const reported = useRef(false)
  useLayoutEffect(() => {
    disabledRef.current = disabled
  }, [disabled])
  useLayoutEffect(() => {
    readyRef.current = onReady
  }, [onReady])
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const detach = attachIndependentSpatialCamera(runtime, camera, canvas, invalidate)
    reported.current = false
    const next = createIndependentSpatialCameraController({
      runtime,
      camera,
      canvas,
      reducedMotion: Boolean(reducedMotion),
      disabled: () => disabledRef.current,
    })
    controller.current = next
    invalidate()
    return () => {
      next?.dispose()
      if (controller.current === next) controller.current = null
      detach()
      cancelAnimationFrame(readyFrame.current)
    }
  }, [camera, canvas, invalidate, reducedMotion, runtime])
  useFrame((_, delta) => {
    if (!controller.current) return
    controller.current.update(delta)
    if (!reported.current) {
      reported.current = true
      // This callback follows the actual WebGL render, so loading cannot reveal an empty frame.
      readyFrame.current = requestAnimationFrame(() => {
        readyRef.current()
      })
    }
  })
  useEffect(
    () => () => {
      cancelAnimationFrame(readyFrame.current)
    },
    [],
  )
  return null
}
