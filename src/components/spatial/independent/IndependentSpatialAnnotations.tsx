import { useLayoutEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type {
  IndependentSpatialRuntime,
  SpatialSceneModel,
} from '@renderer/lib/independentSpatialRuntime'
import {
  sceneAnnotationAnchors,
  type SceneAnnotationAnchor,
} from '@renderer/lib/threeSceneAnnotations'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'

const Label = ({
  runtime,
  anchor,
}: {
  runtime: IndependentSpatialRuntime
  anchor: SceneAnnotationAnchor
}) => {
  const element = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    let current = anchor
    const update = (kind?: 'camera' | 'model' | 'preview') => {
      if (kind === 'preview' || kind === 'model')
        current = sceneAnnotationAnchors(runtime).find((item) => item.id === anchor.id) ?? anchor
      const camera = runtime.camera,
        canvas = runtime.canvas
      if (!camera || !canvas || !element.current) return
      const point = new Vector3(...current.center).applyMatrix4(camera.matrixWorldInverse)
      element.current.hidden = point.z >= -camera.near
      point.x += current.offset[0]
      point.y += current.offset[1]
      point.applyMatrix4(camera.projectionMatrix)
      element.current.style.transform = `translate(${((point.x + 1) * canvas.clientWidth) / 2}px,${((1 - point.y) * canvas.clientHeight) / 2}px)`
    }
    update()
    return runtime.subscribe(update)
  }, [runtime, anchor])
  return (
    <div
      ref={element}
      className="pointer-events-auto absolute top-0 left-0"
      style={{ maxWidth: anchor.width }}
    >
      <InlineAnnotationLabel
        kind={anchor.kind}
        id={anchor.id}
        text={anchor.text}
        color={anchor.color}
      />
    </div>
  )
}
export const IndependentSpatialAnnotations = ({
  runtime,
  model,
}: {
  runtime: IndependentSpatialRuntime
  model: SpatialSceneModel
}) => {
  const anchors = useMemo(() => sceneAnnotationAnchors({ ...runtime, model }), [runtime, model])
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]">
      {anchors.map((anchor) => (
        <Label key={`${anchor.kind}:${anchor.id}`} runtime={runtime} anchor={anchor} />
      ))}
    </div>
  )
}
