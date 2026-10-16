import { Euler, Plane, Quaternion, Raycaster, Vector2, Vector3, type Camera } from 'three'
import { normalizeTopicSelection, type MindMapDocument } from '@core'
import { getSubtreeIds } from '@core/tree'
import { layoutDocument } from '@layout'
import {
  spatialBounds,
  type SpatialLayout,
  type SpatialNode,
  type SpatialPoint,
} from '../../../layout/spatial'
import { projectSpatialGeometry } from '../../../layout/spatial-geometry'
import type { LayoutDirection, MindMapLayout } from '../../../layout/types'
import type { DropNode } from './canvasDrop'

interface Point {
  readonly x: number
  readonly y: number
}
export interface SpatialViewport {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}
export type SpatialScreenRect = SpatialViewport
export interface SpatialDragPlane {
  readonly plane: Plane
  readonly origin: SpatialPoint
}

/** Match SpatialTopic's camera-facing card, including its local tilt and thickness. */
export function projectSpatialNode(
  node: SpatialNode,
  camera: Camera,
  viewport: SpatialViewport,
): SpatialScreenRect | undefined {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined
  camera.updateWorldMatrix(true, false)
  const facing = camera.getWorldQuaternion(new Quaternion())
  const rotation = new Euler(0.025, -0.09, 0)
  const center = new Vector3(...node.position)
  const corners: Vector3[] = []
  for (const x of [-node.width / 2, node.width / 2])
    for (const y of [-node.height / 2, node.height / 2])
      for (const z of [-0.08, 0.08]) {
        const world = new Vector3(x, y, z).applyEuler(rotation).applyQuaternion(facing).add(center)
        const view = world.clone().applyMatrix4(camera.matrixWorldInverse)
        const projected = world.project(camera)
        if (view.z >= 0 || projected.z < -1 || projected.z > 1) return undefined
        corners.push(projected)
      }
  const left = Math.min(...corners.map((corner) => corner.x))
  const right = Math.max(...corners.map((corner) => corner.x))
  const bottom = Math.min(...corners.map((corner) => corner.y))
  const top = Math.max(...corners.map((corner) => corner.y))
  if (right < -1 || left > 1 || top < -1 || bottom > 1) return undefined
  return {
    left: viewport.left + ((left + 1) * viewport.width) / 2,
    top: viewport.top + ((1 - top) * viewport.height) / 2,
    width: ((right - left) * viewport.width) / 2,
    height: ((top - bottom) * viewport.height) / 2,
  }
}

export function projectSpatialDropNodes(
  nodes: readonly SpatialNode[],
  camera: Camera,
  viewport: SpatialViewport,
  directions?: ReadonlyMap<string, LayoutDirection>,
): DropNode[] {
  return nodes.flatMap((node): DropNode[] => {
    const rect = projectSpatialNode(node, camera, viewport)
    return rect
      ? [
          {
            id: node.id,
            position: { x: rect.left, y: rect.top },
            width: rect.width,
            height: rect.height,
            direction: directions?.get(node.id) ?? 'right',
          },
        ]
      : []
  })
}

/** Either drag direction selects only cards wholly contained by the rectangle. */
export function spatialRectangleSelection(
  nodes: readonly SpatialNode[],
  camera: Camera,
  viewport: SpatialViewport,
  start: Point,
  end: Point,
): string[] {
  const left = Math.min(start.x, end.x),
    right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y),
    bottom = Math.max(start.y, end.y)
  return nodes.flatMap((node) => {
    const rect = projectSpatialNode(node, camera, viewport)
    return rect &&
      rect.left >= left &&
      rect.top >= top &&
      rect.left + rect.width <= right &&
      rect.top + rect.height <= bottom
      ? [node.id]
      : []
  })
}

function planePoint(camera: Camera, viewport: SpatialViewport, point: Point, plane: Plane) {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined
  camera.updateWorldMatrix(true, false)
  const raycaster = new Raycaster()
  raycaster.setFromCamera(
    new Vector2(
      ((point.x - viewport.left) / viewport.width) * 2 - 1,
      1 - ((point.y - viewport.top) / viewport.height) * 2,
    ),
    camera,
  )
  return raycaster.ray.intersectPlane(plane, new Vector3()) ?? undefined
}

export function createSpatialDrag(
  camera: Camera,
  viewport: SpatialViewport,
  start: Point,
  anchor: SpatialPoint,
): SpatialDragPlane | undefined {
  camera.updateWorldMatrix(true, false)
  const plane = new Plane().setFromNormalAndCoplanarPoint(
    camera.getWorldDirection(new Vector3()),
    new Vector3(...anchor),
  )
  const origin = planePoint(camera, viewport, start, plane)
  return origin ? { plane, origin: [origin.x, origin.y, origin.z] } : undefined
}

export function spatialDragDelta(
  camera: Camera,
  viewport: SpatialViewport,
  point: Point,
  drag: SpatialDragPlane,
): SpatialPoint | undefined {
  const hit = planePoint(camera, viewport, point, drag.plane)
  return hit ? [hit.x - drag.origin[0], hit.y - drag.origin[1], hit.z - drag.origin[2]] : undefined
}

export function spatialDragSelection(document: MindMapDocument, selected: readonly string[]) {
  const roots = normalizeTopicSelection(
    document,
    selected.filter((id) => id !== document.rootId),
  )
  return { roots, ids: new Set(roots.flatMap((id) => getSubtreeIds(document, id))) }
}

/** Reproject routes and owner-bound structures from the unchanged document's planar layout. */
export function previewSpatialDrag(
  document: MindMapDocument,
  layout: SpatialLayout,
  ids: ReadonlySet<string>,
  delta: SpatialPoint,
  planar: MindMapLayout = layoutDocument(document),
): SpatialLayout {
  const nodes = layout.nodes.map((node): SpatialNode =>
    ids.has(node.id)
      ? {
          ...node,
          position: [
            node.position[0] + delta[0],
            node.position[1] + delta[1],
            node.position[2] + delta[2],
          ],
        }
      : node,
  )
  // Source motion is applied by projectSpatialGeometry; blend the relative target motion.
  const routed = {
    ...planar,
    edges: planar.edges.map((edge) => {
      const relative = Number(ids.has(edge.target)) - Number(ids.has(edge.source))
      return !edge.waypoints || !relative
        ? edge
        : {
            ...edge,
            waypoints: edge.waypoints.map((point, index, points) => {
              const fraction = index / Math.max(1, points.length - 1)
              return {
                x: point.x + relative * delta[0] * 100 * fraction,
                y: point.y - relative * delta[1] * 100 * fraction,
              }
            }),
          }
    }),
  }
  const geometry = projectSpatialGeometry(
    routed,
    nodes,
    document.rootId,
    new Set(
      Object.values(document.topics)
        .filter((topic) => topic.style?.lineStyle === 'straight')
        .map((topic) => topic.id),
    ),
  )
  return { nodes, ...geometry, bounds: spatialBounds([...nodes, ...geometry.decorations]) }
}

/** Depth is preview-only; floating topic persistence uses the document's planar coordinates. */
export function spatialDocumentDelta(delta: SpatialPoint): Point {
  return { x: delta[0] * 100, y: -delta[1] * 100 }
}
