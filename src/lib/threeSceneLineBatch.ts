import {
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import {
  commonSceneLineOffset,
  sceneLinePreviewStamp,
  sceneRouteTranslation,
} from '@renderer/lib/threeSceneLinePreview'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import {
  collectSceneRoutes,
  sampleScenePath,
  sceneLineVertex,
  type SceneLineRoute,
  type ScenePoint,
} from '@renderer/lib/threeScenePaths'

const vertexShader = `
attribute vec3 startCenter;
attribute vec3 endCenter;
attribute vec2 startAnchor;
attribute vec2 endAnchor;
attribute vec3 inkColor;
attribute vec2 lineStyle;
uniform vec2 resolution;
uniform vec3 sceneOffset;
varying vec3 vColor;
varying float vDistance;
varying float vDashed;
varying float vAcross;
void main() {
  vec4 a = modelViewMatrix * vec4(startCenter + sceneOffset, 1.0);
  vec4 b = modelViewMatrix * vec4(endCenter + sceneOffset, 1.0);
  a.xy += startAnchor; b.xy += endAnchor;
  vec4 ca = projectionMatrix * a;
  vec4 cb = projectionMatrix * b;
  vec2 direction = (cb.xy / cb.w - ca.xy / ca.w) * resolution;
  float distance = max(length(direction), 0.0001);
  vec2 normal = vec2(-direction.y, direction.x) / distance;
  vec4 point = mix(ca, cb, position.x);
  point.xy += normal * position.y * lineStyle.x / resolution * point.w;
  if (lineStyle.x <= 0.0 || (a.z > -0.1 && b.z > -0.1)) point = vec4(2.0, 2.0, 2.0, 1.0);
  gl_Position = point;
  vColor = inkColor;
  vDistance = position.x * distance * 0.5;
  vDashed = lineStyle.y;
  vAcross = position.y;
}`
const fragmentShader = `
varying vec3 vColor;
varying float vDistance;
varying float vDashed;
varying float vAcross;
void main() {
  float feather = max(fwidth(vAcross), 0.0001);
  float coverage = 1.0 - smoothstep(1.0 - feather, 1.0, abs(vAcross));
  if (vDashed > 0.5 && mod(vDistance, 12.0) > 7.0) discard;
  gl_FragColor = vec4(vColor, coverage);
  #include <colorspace_fragment>
}`
const SEGMENTS_PER_ROUTE = 64

export const createThreeSceneLineBatch = (runtime: IndependentSpatialRuntime) => {
  const canonicalRuntime = {
    ...runtime,
    offsets: new Map(),
    scales: new Map(),
    relationPreviews: new Map(),
  }
  const routes = collectSceneRoutes(canonicalRuntime)
  const paths = routes.map((route) => sampleScenePath(route.path))
  const slots = paths.map((sampled, index) =>
    Math.max(
      routes[index]?.id.startsWith('relation-') ? 96 : SEGMENTS_PER_ROUTE,
      sampled.reduce((total, points) => total + Math.max(0, points.length - 1), 0) + 4,
    ),
  )
  const starts: number[] = []
  let allocated = 0
  for (const count of slots) {
    starts.push(allocated)
    allocated += count
  }
  const capacity = Math.max(1, allocated)
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3),
  )
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  const attributes = {
    startCenter: new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    endCenter: new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    startAnchor: new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
    endAnchor: new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
    inkColor: new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    lineStyle: new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
  }
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute)
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { resolution: { value: new Vector2(1, 1) }, sceneOffset: { value: new Vector3() } },
    transparent: true,
    alphaToCoverage: true,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 0
  mesh.onBeforeRender = (renderer) => {
    renderer.getSize(material.uniforms.resolution?.value as Vector2)
  }
  const previous = new Map<string, string>()
  const writeSegment = (
    index: number,
    route: SceneLineRoute,
    a: ScenePoint,
    b: ScenePoint,
    start: number,
    end: number,
  ) => {
    const from = sceneLineVertex(route, a, start),
      to = sceneLineVertex(route, b, end)
    attributes.startCenter.setXYZ(index, ...from.center)
    attributes.endCenter.setXYZ(index, ...to.center)
    attributes.startAnchor.setXY(index, ...from.anchor)
    attributes.endAnchor.setXY(index, ...to.anchor)
    const color = new Color(route.color)
    attributes.inkColor.setXYZ(index, color.r, color.g, color.b)
    attributes.lineStyle.setXY(index, route.width, route.dashed ? 1 : 0)
  }
  const writeRoute = (
    route: SceneLineRoute,
    routeIndex: number,
    sampled: ReturnType<typeof sampleScenePath>,
  ) => {
    const start = starts[routeIndex] ?? 0
    const count = slots[routeIndex] ?? SEGMENTS_PER_ROUTE
    for (let index = start; index < start + count; index++) attributes.lineStyle.setXY(index, 0, 0)
    let index = start
    for (const points of sampled) {
      points.slice(1).forEach((point, offset) => {
        const previousPoint = points[offset]
        if (!previousPoint || index >= start + count - 4) return
        writeSegment(
          index++,
          route,
          previousPoint,
          point,
          offset / (points.length - 1),
          (offset + 1) / (points.length - 1),
        )
      })
    }
    const arrow = (points: readonly ScenePoint[], end: boolean) => {
      const tip = end ? points.at(-1) : points[0],
        other = end ? points.at(-2) : points[1]
      if (!tip || !other) return
      const dx = tip.x - other.x,
        dy = tip.y - other.y,
        length = Math.max(0.01, Math.hypot(dx, dy))
      const size = 8 + route.width * 1.5
      for (const sign of [-1, 1]) {
        const wing = {
          x: tip.x - (dx / length) * size + (dy / length) * size * 0.45 * sign,
          y: tip.y - (dy / length) * size - (dx / length) * size * 0.45 * sign,
        }
        writeSegment(index++, { ...route, dashed: false }, tip, wing, end ? 1 : 0, end ? 1 : 0)
      }
    }
    if (route.arrow !== 'none') arrow(sampled.at(-1) ?? [], true)
    if (route.arrow === 'both') arrow(sampled[0] ?? [], false)
    for (const attribute of Object.values(attributes))
      attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize)
  }
  routes.forEach((route, index) => {
    writeRoute(route, index, paths[index] ?? [])
  })
  geometry.instanceCount = allocated
  const canonical = Object.values(attributes).map((attribute) => attribute.array.slice())
  let canonicalBuffers = true
  const offsetUniform = material.uniforms.sceneOffset?.value as Vector3
  const update = () => {
    const common = commonSceneLineOffset(runtime)
    if (common) {
      if (!canonicalBuffers) {
        Object.values(attributes).forEach((attribute, index) => {
          const original = canonical[index]
          if (original) attribute.array.set(original)
          attribute.clearUpdateRanges()
          attribute.needsUpdate = true
        })
        previous.clear()
        canonicalBuffers = true
      }
      offsetUniform.set(common.x, -common.y, common.z)
      return
    }
    offsetUniform.set(0, 0, 0)
    const changed = new Set<string>()
    routes.forEach((route) => {
      const stamp = sceneLinePreviewStamp(runtime, route)
      const old = previous.get(route.id) ?? sceneLinePreviewStamp(canonicalRuntime, route)
      if (stamp !== old) {
        changed.add(route.id)
        previous.set(route.id, stamp)
      }
    })
    if (!changed.size) return
    const complex = new Set<string>()
    routes.forEach((route, index) => {
      if (!changed.has(route.id)) return
      const translation = sceneRouteTranslation(runtime, route)
      if (!translation) {
        complex.add(route.id)
        return
      }
      const start = starts[index] ?? 0
      const count = slots[index] ?? SEGMENTS_PER_ROUTE
      Object.entries(attributes).forEach(([name, attribute], attributeIndex) => {
        const original = canonical[attributeIndex]
        const from = start * attribute.itemSize,
          to = (start + count) * attribute.itemSize
        if (original) attribute.array.set(original.subarray(from, to), from)
        if (name === 'startCenter' || name === 'endCenter') {
          for (let slot = start; slot < start + count; slot++)
            attribute.setXYZ(
              slot,
              attribute.getX(slot) + translation.x,
              attribute.getY(slot) - translation.y,
              attribute.getZ(slot) + translation.z,
            )
        }
        attribute.addUpdateRange(from, to - from)
      })
    })
    const current = new Map(
      (complex.size ? collectSceneRoutes(runtime, complex) : []).map((route) => [route.id, route]),
    )
    routes.forEach((route, index) => {
      const preview = current.get(route.id)
      if (preview) writeRoute(preview, index, sampleScenePath(preview.path))
    })
    for (const attribute of Object.values(attributes)) attribute.needsUpdate = true
    canonicalBuffers = false
  }
  update()
  return {
    mesh,
    update,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
