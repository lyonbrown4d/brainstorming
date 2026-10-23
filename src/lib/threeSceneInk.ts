import { independentSpatialInkKey } from '@renderer/lib/independentSpatialInkIdentity'
import {
  BufferGeometry,
  type BufferAttribute,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  ShapeGeometry,
} from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { inkGeometry } from '@shared/ink-geometry'

const vertexShader = `
attribute vec3 center;
attribute vec3 inkColor;
varying vec3 vColor;
void main() {
  vec4 point = modelViewMatrix * vec4(center, 1.0);
  point.xy += position.xy;
  gl_Position = projectionMatrix * point;
  vColor = inkColor;
}`
const fragmentShader = `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}`
const selectionVertex = `
attribute vec3 center;
attribute vec2 size;
attribute float selected;
varying vec2 vLocal;
varying vec2 vSize;
varying float vSelected;
void main() {
  vec4 point = modelViewMatrix * vec4(center, 1.0);
  point.xy += position.xy * size;
  gl_Position = projectionMatrix * point;
  vLocal = uv; vSize = size; vSelected = selected;
}`
const selectionFragment = `
varying vec2 vLocal;
varying vec2 vSize;
varying float vSelected;
void main() {
  vec2 edge = min(vLocal, 1.0 - vLocal) * vSize;
  if (vSelected < 0.5 || min(edge.x, edge.y) > 2.0) discard;
  gl_FragColor = vec4(0.22, 0.40, 0.63, 1.0);
  #include <colorspace_fragment>
}`

/** Perfect-freehand's shared outline is triangulated once and drawn in one merged batch. */
export const createThreeSceneInk = (runtime: IndependentSpatialRuntime) => {
  const strokes = runtime.model.document.drawings ?? []
  const entries: {
    id: string
    x: number
    y: number
    z: number
    width: number
    height: number
    start: number
    count: number
  }[] = []
  const parts: BufferGeometry[] = []
  let vertexCount = 0
  for (const stroke of strokes) {
    const ink = inkGeometry(stroke)
    if (!ink.path) continue
    const parsed = new SVGLoader().parse(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="${ink.path}"/></svg>`,
    )
    const shapes = parsed.paths.flatMap((path) => path.toShapes())
    const indexed = new ShapeGeometry(shapes)
    const part = indexed.toNonIndexed()
    indexed.dispose()
    const position = part.getAttribute('position')
    const x = ink.bounds.x + ink.bounds.width / 2,
      y = ink.bounds.y + ink.bounds.height / 2
    const color = new Color(stroke.color)
    const centers = new Float32Array(position.count * 3),
      colors = new Float32Array(position.count * 3)
    for (let index = 0; index < position.count; index++) {
      position.setXYZ(index, position.getX(index) - x, y - position.getY(index), 0)
      centers.set([x, -y, stroke.spatialDepth ?? 0], index * 3)
      colors.set([color.r, color.g, color.b], index * 3)
    }
    part.setAttribute('center', new Float32BufferAttribute(centers, 3))
    part.setAttribute('inkColor', new Float32BufferAttribute(colors, 3))
    entries.push({
      id: independentSpatialInkKey(runtime.model.document, stroke.id),
      x,
      y,
      z: stroke.spatialDepth ?? 0,
      width: ink.bounds.width,
      height: ink.bounds.height,
      start: vertexCount,
      count: position.count,
    })
    vertexCount += position.count
    parts.push(part)
  }
  const geometry = parts.length ? mergeGeometries(parts) : new BufferGeometry()
  for (const part of parts) part.dispose()
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthWrite: true,
    side: DoubleSide,
    toneMapped: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  const selectionGeometry = new InstancedBufferGeometry()
  selectionGeometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  )
  selectionGeometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  selectionGeometry.setIndex([0, 1, 2, 0, 2, 3])
  selectionGeometry.instanceCount = strokes.length
  const selectionCenters = new InstancedBufferAttribute(new Float32Array(strokes.length * 3), 3)
  const selected = new InstancedBufferAttribute(new Float32Array(strokes.length), 1)
  const sizes = new InstancedBufferAttribute(new Float32Array(strokes.length * 2), 2)
  selectionGeometry.setAttribute('center', selectionCenters)
  selectionGeometry.setAttribute('selected', selected)
  selectionGeometry.setAttribute('size', sizes)
  const selectionMaterial = new ShaderMaterial({
    vertexShader: selectionVertex,
    fragmentShader: selectionFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const selectionMesh = new Mesh(selectionGeometry, selectionMaterial)
  selectionMesh.frustumCulled = false
  selectionMesh.renderOrder = 3
  const positions = geometry.getAttribute('position') as BufferAttribute
  const originalPositions = entries.length ? positions.array.slice() : null
  const previous = new Map<string, string>()
  const update = (selectedIds: ReadonlySet<string>) => {
    const centers = geometry.getAttribute('center') as BufferAttribute
    for (const entry of entries) {
      const offset = runtime.offsets.get(entry.id)
      const preview = runtime.inkPreviews.get(entry.id)
      const key = `${offset?.x ?? 0}:${offset?.y ?? 0}:${offset?.z ?? 0}:${preview?.x ?? ''}:${preview?.y ?? ''}:${preview?.width ?? ''}:${preview?.height ?? ''}`
      if (previous.get(entry.id) === key) continue
      previous.set(entry.id, key)
      for (let index = entry.start; index < entry.start + entry.count; index++) {
        if (originalPositions)
          positions.setXYZ(
            index,
            (originalPositions[index * 3] ?? 0) * (preview ? preview.width / entry.width : 1),
            (originalPositions[index * 3 + 1] ?? 0) * (preview ? preview.height / entry.height : 1),
            0,
          )
        centers.setXYZ(
          index,
          (preview ? preview.x + preview.width / 2 : entry.x) + (offset?.x ?? 0),
          -(preview ? preview.y + preview.height / 2 : entry.y) - (offset?.y ?? 0),
          entry.z + (offset?.z ?? 0),
        )
      }
      positions.addUpdateRange(entry.start * 3, entry.count * 3)
      positions.needsUpdate = true
      centers.addUpdateRange(entry.start * 3, entry.count * 3)
      centers.needsUpdate = true
    }
    strokes.forEach((stroke, index) => {
      const id = independentSpatialInkKey(runtime.model.document, stroke.id),
        offset = runtime.offsets.get(id),
        bounds = runtime.inkPreviews.get(id) ?? inkGeometry(stroke).bounds
      selectionCenters.setXYZ(
        index,
        bounds.x + bounds.width / 2 + (offset?.x ?? 0),
        -bounds.y - bounds.height / 2 - (offset?.y ?? 0),
        (stroke.spatialDepth ?? 0) + (offset?.z ?? 0),
      )
      sizes.setXY(index, bounds.width + 8, bounds.height + 8)
      selected.setX(index, selectedIds.has(stroke.id) ? 1 : 0)
    })
    selectionCenters.needsUpdate = true
    sizes.needsUpdate = true
    selected.needsUpdate = true
  }
  return {
    meshes: [mesh, selectionMesh],
    update,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      selectionGeometry.dispose()
      selectionMaterial.dispose()
    },
  }
}
