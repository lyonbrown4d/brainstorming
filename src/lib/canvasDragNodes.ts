import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'

/** Preserve dimensions measured by React Flow while only selection/position changes. */
export const preserveMeasurement = (
  node: CanvasFlowNode,
  previous: CanvasFlowNode | undefined,
): CanvasFlowNode =>
  previous?.measured &&
  node.style?.width === previous.style?.width &&
  node.style?.height === previous.style?.height &&
  (typeof node.style?.width !== 'number' ||
    previous.measured.width === undefined ||
    Math.abs(node.style.width - previous.measured.width) < 0.5) &&
  (typeof node.style?.height !== 'number' ||
    previous.measured.height === undefined ||
    Math.abs(node.style.height - previous.measured.height) < 0.5)
    ? { ...node, measured: previous.measured }
    : node

interface NodeSynchronization {
  readonly geometryChanged: boolean
  readonly dragging: ReadonlySet<string> | undefined
  readonly topics: ReadonlySet<string>
  readonly drawings: ReadonlySet<string>
  readonly playing: boolean
}

/** Selection notifications do not rewind positions retained after a pointer gesture. */
export const synchronizeCanvasNodes = (
  previous: CanvasFlowNode[],
  projected: CanvasFlowNode[],
  state: NodeSynchronization,
): CanvasFlowNode[] => {
  const existing = new Map(previous.map((node) => [node.id, node]))
  let changed =
    previous.length !== projected.length ||
    previous.some((node, index) => node.id !== projected[index]?.id)
  const next = projected.map((node) => {
    const old = existing.get(node.id)
    const measured = state.geometryChanged ? preserveMeasurement(node, old) : (old ?? node)
    const position =
      !state.geometryChanged || state.dragging?.has(node.id)
        ? (old?.position ?? node.position)
        : node.position
    const selected =
      node.type === 'ink' ? state.drawings.has(node.data.stroke.id) : state.topics.has(node.id)
    const draggable = node.draggable !== false && !state.playing
    if (
      old?.data === measured.data &&
      old.style === measured.style &&
      old.width === measured.width &&
      old.height === measured.height &&
      old.initialWidth === measured.initialWidth &&
      old.initialHeight === measured.initialHeight &&
      old.measured === measured.measured &&
      old.resizing === measured.resizing &&
      old.position.x === position.x &&
      old.position.y === position.y &&
      old.selected === selected &&
      old.draggable === draggable &&
      old.zIndex === node.zIndex
    )
      return old
    changed = true
    const updated: CanvasFlowNode = { ...measured, position, selected, draggable }
    if (node.zIndex === undefined) delete updated.zIndex
    else updated.zIndex = node.zIndex
    return updated
  })
  return changed ? next : previous
}
