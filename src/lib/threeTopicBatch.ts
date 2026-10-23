import {
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import type { ThreeTopicAtlas } from '@renderer/lib/threeTopicAtlas'
import { TOPIC_ATLAS_SIZE } from '@renderer/lib/threeTopicAtlasLayout'

const vertexShader = `
attribute vec3 center;
attribute vec2 size;
attribute vec4 atlasRect;
attribute float selected;
varying vec2 vUv;
varying vec2 vLocal;
varying vec2 vSize;
varying float vSelected;
void main() {
  vec4 point = modelViewMatrix * vec4(center, 1.0);
  point.xy += position.xy * size;
  gl_Position = projectionMatrix * point;
  vLocal = uv;
  vSize = size;
  vUv = atlasRect.xy + uv * atlasRect.zw;
  vSelected = selected;
}`
const fragmentShader = `
uniform sampler2D atlas;
varying vec2 vUv;
varying vec2 vLocal;
varying vec2 vSize;
varying float vSelected;
void main() {
  vec4 ink = texture2D(atlas, vUv);
  vec2 edge = min(vLocal, 1.0 - vLocal) * vSize;
  float border = step(1.0, min(edge.x, edge.y)) * (1.0 - step(3.0, min(edge.x, edge.y)));
  if (vSelected > 0.5 && border > 0.5) ink = vec4(vSelected > 1.5 ? vec3(0.20, 0.64, 0.48) : vec3(0.22, 0.40, 0.63), 1.0);
  if (ink.a < 0.01) discard;
  gl_FragColor = ink;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** One draw per atlas page; billboard orientation is calculated entirely on the GPU. */
export const createThreeTopicBatches = (
  atlas: ThreeTopicAtlas,
  runtime: IndependentSpatialRuntime,
) => {
  let excluded: ReadonlySet<string> = new Set()
  const batches = atlas.textures.map((texture, page) => {
    const tiles = atlas.tiles.filter((tile) => tile.page === page)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    )
    geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.instanceCount = tiles.length
    const centers = new InstancedBufferAttribute(new Float32Array(tiles.length * 3), 3)
    const selected = new InstancedBufferAttribute(new Float32Array(tiles.length), 1)
    geometry.setAttribute('center', centers)
    geometry.setAttribute('selected', selected)
    const sizes = new InstancedBufferAttribute(
      new Float32Array(tiles.flatMap((tile) => [tile.width + 8, tile.height + 8])),
      2,
    )
    geometry.setAttribute('size', sizes)
    geometry.setAttribute(
      'atlasRect',
      new InstancedBufferAttribute(
        new Float32Array(
          tiles.flatMap((tile) => [
            (tile.x + 0.5) / TOPIC_ATLAS_SIZE,
            1 - (tile.y + tile.pixelHeight - 0.5) / TOPIC_ATLAS_SIZE,
            (tile.pixelWidth - 1) / TOPIC_ATLAS_SIZE,
            (tile.pixelHeight - 1) / TOPIC_ATLAS_SIZE,
          ]),
        ),
        4,
      ),
    )
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { atlas: { value: texture } },
      transparent: true,
      depthWrite: true,
      toneMapped: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return { tiles, centers, sizes, selected, mesh }
  })
  const entries = new Map(
    batches.flatMap((batch) =>
      batch.tiles.map((tile, index) => [tile.id, { batch, tile, index }] as const),
    ),
  )
  const update = (selectedIds: ReadonlySet<string>) => {
    const nodes = new Map(runtime.model.layout.nodes.map((node) => [node.id, node]))
    for (const batch of batches) {
      batch.tiles.forEach((tile, index) => {
        const node = nodes.get(tile.id)
        if (!node) return
        const offset = runtime.offsets.get(tile.id)
        batch.centers.setXYZ(
          index,
          node.x + node.width / 2 + (offset?.x ?? 0),
          -node.y - node.height / 2 - (offset?.y ?? 0),
          (runtime.model.depths[tile.id] ?? 0) + (offset?.z ?? 0),
        )
        const scale = runtime.scales.get(tile.id) ?? 1
        batch.sizes.setXY(
          index,
          runtime.hiddenTopics.has(tile.id) || excluded.has(tile.id) ? 0 : (tile.width + 8) * scale,
          (tile.height + 8) * scale,
        )
        batch.selected.setX(
          index,
          runtime.dropTarget === tile.id ? 2 : selectedIds.has(tile.id) ? 1 : 0,
        )
      })
      batch.centers.needsUpdate = true
      batch.selected.needsUpdate = true
      batch.sizes.needsUpdate = true
    }
  }
  return {
    meshes: batches.map((batch) => batch.mesh),
    update,
    setExcluded: (ids: ReadonlySet<string>) => {
      const changed = new Set([...excluded, ...ids])
      excluded = ids
      for (const id of changed) {
        const entry = entries.get(id)
        if (!entry) continue
        const { batch, tile, index } = entry
        const scale = runtime.scales.get(id) ?? 1
        batch.sizes.setXY(
          index,
          runtime.hiddenTopics.has(id) || excluded.has(id) ? 0 : (tile.width + 8) * scale,
          (tile.height + 8) * scale,
        )
        batch.sizes.needsUpdate = true
      }
    },
    dispose: () => {
      for (const batch of batches) {
        batch.mesh.geometry.dispose()
        batch.mesh.material.dispose()
      }
    },
  }
}
