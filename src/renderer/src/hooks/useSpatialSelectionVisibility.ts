import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import { Vector3 } from 'three'
import type { SpatialNode } from '../../../layout/spatial'
import { spatialSelectionShift } from '../lib/spatialSelectionVisibility'
import { spatialSafeViewport } from '../lib/spatialSafeViewport'
import { useEditor } from '../state/editor'

interface Options {
  readonly controls: RefObject<CameraControlsImpl | null>
  readonly nodes: readonly SpatialNode[]
  readonly selectedId: string
  readonly frameKey: string
  readonly framing: RefObject<boolean>
  readonly enabled: boolean
}

/** Navigation reveals new selections; document edits and restored views retain their framing. */
export function useSpatialSelectionVisibility({
  controls,
  nodes,
  selectedId,
  frameKey,
  framing,
  enabled,
}: Options): void {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const previous = useRef<{ selectedId: string; frameKey: string } | null>(null)
  useEffect(() => {
    const prior = previous.current
    previous.current = { selectedId, frameKey }
    const controller = controls.current
    if (
      prior?.frameKey !== frameKey ||
      prior.selectedId === selectedId ||
      !enabled ||
      framing.current ||
      !controller
    )
      return
    const selected = nodes.find((node) => node.id === selectedId)
    if (!selected) return
    const viewport = gl.domElement.getBoundingClientRect()
    const editor = useEditor.getState()
    const visible = spatialSafeViewport(viewport, editor.outlineOpen, editor.inspectorOpen)
    const shift = spatialSelectionShift(camera, selected, viewport, visible)
    if (!shift || shift.lengthSq() < 1e-12) return
    const target = controller.getTarget(new Vector3()).add(shift)
    void controller.moveTo(target.x, target.y, target.z, false)
    controller.update(0)
    invalidate()
  }, [camera, controls, enabled, frameKey, framing, gl, invalidate, nodes, selectedId])
}
