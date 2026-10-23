import type { MiniMapProps, Node } from '@xyflow/react'
import { parse } from 'culori'

interface MinimapLookupNode {
  readonly internals: {
    readonly positionAbsolute: { readonly x: number; readonly y: number }
    readonly userNode: Node
  }
}
export type MinimapLookup = ReadonlyMap<string, MinimapLookupNode>
export interface MinimapRectangle {
  readonly node: Node
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
export interface MinimapPathGroup {
  readonly id: string
  readonly fill: string
  readonly selected: boolean
  readonly path: string
  readonly count: number
}

/** Match official MiniMap visibility and dimension precedence against adopted absolute positions. */
export const canvasMinimapRectangles = (
  nodes: readonly Node[],
  lookup: MinimapLookup,
): MinimapRectangle[] => {
  const rectangles: MinimapRectangle[] = []
  for (const item of nodes) {
    const internal = lookup.get(item.id)
    if (!internal) continue
    const node = internal.internals.userNode
    if (node.hidden) continue
    const width = node.measured?.width ?? node.width ?? node.initialWidth
    const height = node.measured?.height ?? node.height ?? node.initialHeight
    const { x, y } = internal.internals.positionAbsolute
    if (
      width === undefined ||
      height === undefined ||
      width <= 0 ||
      height <= 0 ||
      ![x, y, width, height].every(Number.isFinite)
    )
      continue
    rectangles.push({ node, x, y, width, height })
  }
  return rectangles
}

/** SVG rect rx/ry are clamped independently; arcs retain exact fractional coordinates. */
export const canvasMinimapRectanglePath = (
  { x, y, width, height }: Omit<MinimapRectangle, 'node'>,
  radius: number,
): string => {
  const corner = Number.isFinite(radius) ? Math.max(0, radius) : 0
  const rx = Math.min(corner, width / 2)
  const ry = Math.min(corner, height / 2)
  const right = x + width
  const bottom = y + height
  if (!rx || !ry) return `M${x},${y}H${right}V${bottom}H${x}Z`
  return (
    `M${x + rx},${y}H${right - rx}A${rx},${ry} 0 0 1 ${right},${y + ry}` +
    `V${bottom - ry}A${rx},${ry} 0 0 1 ${right - rx},${bottom}` +
    `H${x + rx}A${rx},${ry} 0 0 1 ${x},${bottom - ry}` +
    `V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`
  )
}

/** Adjacent opaque runs preserve painting order and avoid changing alpha compositing. */
export const canvasMinimapPathGroups = (
  rectangles: readonly MinimapRectangle[],
  nodeColor: MiniMapProps['nodeColor'],
  radius = 5,
): MinimapPathGroup[] | null => {
  const groups: { id: string; fill: string; selected: boolean; paths: string[] }[] = []
  const opaque = new Map<string, boolean>()
  for (const rectangle of rectangles) {
    const { node } = rectangle
    const color = typeof nodeColor === 'function' ? nodeColor(node) : nodeColor
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Match official MiniMap's empty-color fallback.
    const fill = color || node.style?.background || node.style?.backgroundColor
    if (typeof fill !== 'string' || !fill) return null
    let safe = opaque.get(fill)
    if (safe === undefined) {
      const parsed = parse(fill)
      safe = parsed !== undefined && (parsed.alpha ?? 1) === 1
      opaque.set(fill, safe)
    }
    if (!safe) return null
    const selected = Boolean(node.selected)
    let group = groups.at(-1)
    if (group?.fill !== fill || group.selected !== selected) {
      group = { id: node.id, fill, selected, paths: [] }
      groups.push(group)
    }
    group.paths.push(canvasMinimapRectanglePath(rectangle, radius))
  }
  return groups.map(({ id, fill, selected, paths }) => ({
    id,
    fill,
    selected,
    path: paths.join(''),
    count: paths.length,
  }))
}

export const canBatchCanvasMinimap = (visibleCount: number, props: MiniMapProps): boolean =>
  visibleCount >= 250 &&
  props.nodeComponent === undefined &&
  props.onNodeClick === undefined &&
  !props.nodeClassName &&
  props.nodeStrokeWidth === 0
