import { Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import { createIndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { createThreeSceneLineBatch } from '@renderer/lib/threeSceneLineBatch'
import { sampleScenePath } from '@renderer/lib/threeScenePaths'
import type * as ScenePaths from '@renderer/lib/threeScenePaths'

vi.mock('@renderer/lib/threeScenePaths', async (importOriginal) => {
  const actual = await importOriginal<typeof ScenePaths>()
  return {
    ...actual,
    sampleScenePath: vi.fn(() => [
      [
        { x: 100, y: 20 },
        { x: 200, y: 20 },
      ],
    ]),
  }
})

const makeRuntime = () =>
  createIndependentSpatialRuntime({
    document: createDocument('Root', 'line-batch-tests'),
    surface: '#ffffff',
    depths: { root: 0, a: 100, b: 200 },
    layout: {
      nodes: [
        { id: 'root', x: 0, y: 0, width: 100, height: 40, side: 'right' },
        { id: 'a', x: 200, y: 0, width: 100, height: 40, side: 'right' },
        { id: 'b', x: 400, y: 0, width: 100, height: 40, side: 'right' },
      ],
      edges: [
        { id: 'first', source: 'root', target: 'a' },
        { id: 'second', source: 'a', target: 'b' },
      ],
    },
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('spatial line preview batches', () => {
  it('moves a whole map through one uniform and reroutes only the moved branch boundary', () => {
    const runtime = makeRuntime()
    const batch = createThreeSceneLineBatch(runtime)
    const centers = batch.mesh.geometry.getAttribute('startCenter')
    const original = Array.from(centers.array)
    const parse = vi.mocked(sampleScenePath)
    parse.mockClear()
    for (const node of runtime.model.layout.nodes)
      runtime.offsets.set(node.id, { x: 30, y: 40, z: 50 })
    batch.update()
    const uniform: unknown = batch.mesh.material.uniforms.sceneOffset?.value
    expect(uniform).toBeInstanceOf(Vector3)
    if (!(uniform instanceof Vector3)) throw new Error('Missing offset uniform')
    expect(uniform.toArray()).toEqual([30, -40, 50])
    expect(Array.from(centers.array)).toEqual(original)
    expect(parse).not.toHaveBeenCalled()
    runtime.offsets.delete('root')
    batch.update()
    expect(uniform.toArray()).toEqual([0, 0, 0])
    expect(parse).toHaveBeenCalledTimes(1)
    const secondRoute = batch.mesh.geometry.instanceCount / 2
    expect(centers.getX(secondRoute)).toBe((original[secondRoute * 3] ?? Number.NaN) + 30)
    expect(centers.getY(secondRoute)).toBe((original[secondRoute * 3 + 1] ?? Number.NaN) - 40)
    parse.mockClear()
    batch.update()
    expect(parse).not.toHaveBeenCalled()
    runtime.offsets.clear()
    batch.update()
    expect(Array.from(centers.array)).toEqual(original)
    batch.dispose()
  })
})
