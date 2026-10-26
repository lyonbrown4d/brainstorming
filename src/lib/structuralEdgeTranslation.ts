import type { ReactFlowState } from '@xyflow/react'

export type StructuralNodes = readonly ReturnType<ReactFlowState['nodeLookup']['get']>[]

/** Reuse curves only when every initialized endpoint undergoes the same rigid translation. */
export const structuralEdgeTranslation = (
  before: StructuralNodes,
  after: StructuralNodes,
): readonly [number, number] | null => {
  const first = before[0],
    next = after[0]
  if (!first || !next || before.length !== after.length) return null
  const dx = next.internals.positionAbsolute.x - first.internals.positionAbsolute.x
  const dy = next.internals.positionAbsolute.y - first.internals.positionAbsolute.y
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  for (let index = 0; index < before.length; index++) {
    const old = before[index],
      node = after[index]
    if (!old || !node) return null
    const x = node.internals.positionAbsolute.x - old.internals.positionAbsolute.x
    const y = node.internals.positionAbsolute.y - old.internals.positionAbsolute.y
    if (
      old.id !== node.id ||
      old.data !== node.data ||
      old.measured.width !== node.measured.width ||
      old.measured.height !== node.measured.height ||
      old.width !== node.width ||
      old.height !== node.height ||
      old.sourcePosition !== node.sourcePosition ||
      old.targetPosition !== node.targetPosition ||
      old.internals.handleBounds !== node.internals.handleBounds ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x - dx) > 0.001 ||
      Math.abs(y - dy) > 0.001
    )
      return null
  }
  return [dx, dy]
}
