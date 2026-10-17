import { Raycaster, Vector2, type Camera, type Scene } from 'three'
import type { MindMapDocument } from '@core'
import type { SpatialNode, SpatialPoint } from '@layout/spatial'
import type { LayoutDirection } from '@layout/types'
import { findTopicDrop } from '@renderer/lib/canvasDrop'
import { projectSpatialDropNodes, type SpatialViewport } from '@renderer/lib/spatialDrag'

/** Pick Html card surfaces first; raycast only when the pointer hits the WebGL canvas. */
export const spatialPointerTopic = (
  target: Element,
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: Camera,
  point: { x: number; y: number },
): string | undefined => {
  const id = target.closest<HTMLElement>('[data-spatial-card-id]')?.dataset.spatialCardId
  if (id || target !== canvas) return id
  const bounds = canvas.getBoundingClientRect()
  const raycaster = new Raycaster()
  raycaster.setFromCamera(
    new Vector2(
      ((point.x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((point.y - bounds.top) / bounds.height) * 2,
    ),
    camera,
  )
  const picked: unknown = raycaster
    .intersectObjects(scene.children, true)
    .find((hit) => typeof hit.object.userData.spatialTopicId === 'string')?.object
    .userData.spatialTopicId
  return typeof picked === 'string' ? picked : undefined
}

/** Adapt the camera projection to the same child/sibling drop rules used by the 2D canvas. */
export const findSpatialDrop = (
  document: MindMapDocument,
  nodes: readonly SpatialNode[],
  anchorId: string,
  delta: SpatialPoint,
  excluded: ReadonlySet<string>,
  camera: Camera,
  viewport: SpatialViewport,
  directions: ReadonlyMap<string, LayoutDirection>,
) => {
  const anchor = nodes.find((node) => node.id === anchorId)
  if (!anchor) return undefined
  const moved = projectSpatialDropNodes(
    [
      {
        ...anchor,
        position: [
          anchor.position[0] + delta[0],
          anchor.position[1] + delta[1],
          anchor.position[2] + delta[2],
        ],
      },
    ],
    camera,
    viewport,
  )[0]
  return moved
    ? findTopicDrop(
        document,
        projectSpatialDropNodes(nodes, camera, viewport, directions),
        excluded,
        { x: moved.position.x + moved.width / 2, y: moved.position.y + moved.height / 2 },
      )
    : undefined
}
