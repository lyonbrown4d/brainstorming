import {
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { sceneAnnotationGeometry } from '@renderer/lib/threeSceneAnnotations'

const vertexShader = `
attribute vec3 center;
attribute vec2 size;
attribute vec4 fill;
varying vec4 vFill;
void main() {
  vec4 point = modelViewMatrix * vec4(center, 1.0);
  point.xy += position.xy * size;
  point.z -= 0.1;
  gl_Position = projectionMatrix * point;
  vFill = fill;
}`
const fragmentShader = `
varying vec4 vFill;
void main() {
  gl_FragColor = vFill;
  #include <colorspace_fragment>
}`

export const createThreeSceneAnnotationBatch = (runtime: IndependentSpatialRuntime) => {
  const count = runtime.model.document.groups?.length ?? 0
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  )
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  const centers = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
  const sizes = new InstancedBufferAttribute(new Float32Array(count * 2), 2)
  const colors = new InstancedBufferAttribute(new Float32Array(count * 4), 4)
  geometry.setAttribute('center', centers)
  geometry.setAttribute('size', sizes)
  geometry.setAttribute('fill', colors)
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  const update = () => {
    const { fills } = sceneAnnotationGeometry(runtime)
    geometry.instanceCount = fills.length
    fills.forEach((fill, index) => {
      centers.setXYZ(index, ...fill.center)
      sizes.setXY(index, ...fill.size)
      const color = new Color(fill.color)
      colors.setXYZW(index, color.r, color.g, color.b, fill.opacity)
    })
    centers.needsUpdate = true
    sizes.needsUpdate = true
    colors.needsUpdate = true
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
