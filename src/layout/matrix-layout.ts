import {
  layoutBounds,
  type LayoutComponent,
  type LayoutUnit,
  type LocalLayout,
} from '@layout/types'
import { requireUnit, treeLayout } from '@layout/tree-layout'

interface MatrixColumn {
  readonly id: string
  readonly width: number
  readonly rows: readonly { readonly id: string; readonly layout: LocalLayout }[]
}

/** Root children are columns, their children are ordered rows; deeper content stays in its cell. */
export const matrixLayout = (
  component: LayoutComponent,
  units: ReadonlyMap<string, LayoutUnit>,
): LocalLayout => {
  const root = requireUnit(units, component.rootId)
  const rowHeights: number[] = []
  let headerHeight = 0
  const columns: MatrixColumn[] = (component.children.get(root.id) ?? []).map((id) => {
    const header = requireUnit(units, id)
    headerHeight = Math.max(headerHeight, header.height + 32)
    let width = header.width + 32
    const rows = (component.children.get(id) ?? []).map((rowId, index) => {
      const layout = treeLayout(component, units, 'right', rowId)
      const bounds = layoutBounds(layout.placements)
      width = Math.max(width, bounds.maxX - bounds.minX + 32)
      rowHeights[index] = Math.max(rowHeights[index] ?? 0, bounds.maxY - bounds.minY + 32)
      return { id: rowId, layout }
    })
    return { id, width, rows }
  })
  const width = columns.reduce((sum, column) => sum + column.width, 0)
  const bodyHeight = rowHeights.reduce((sum, height) => sum + height, 0)
  const top = root.height / 2 + 64
  let left = -width / 2
  const result: LocalLayout = {
    placements: [{ unit: root, x: 0, y: 0, direction: 'down' }],
    edges: [],
    decorations: [],
  }
  for (const column of columns) {
    result.placements.push({
      unit: requireUnit(units, column.id),
      x: left + column.width / 2,
      y: top + headerHeight / 2,
      direction: 'down',
    })
    result.edges.push({
      id: `edge-${column.id}`,
      source: root.id,
      target: column.id,
      routing: 'hidden',
      direction: 'down',
    })
    result.decorations?.push({
      id: `cell-${column.id}`,
      kind: 'cell',
      topicId: column.id,
      x: left,
      y: top,
      width: column.width,
      height: headerHeight,
    })
    // One spanning background covers empty cells without allocating a quadratic sparse grid.
    if (bodyHeight > 0)
      result.decorations?.push({
        id: `column-${column.id}`,
        kind: 'cell',
        topicId: column.id,
        x: left,
        y: top + headerHeight,
        width: column.width,
        height: bodyHeight,
      })
    let y = top + headerHeight
    for (const [index, row] of column.rows.entries()) {
      const height = rowHeights[index] ?? 0
      const bounds = layoutBounds(row.layout.placements)
      const dx = left + 16 - bounds.minX
      const dy = y + 16 - bounds.minY
      for (const placement of row.layout.placements)
        result.placements.push({ ...placement, x: placement.x + dx, y: placement.y + dy })
      result.edges.push(
        {
          id: `edge-${row.id}`,
          source: column.id,
          target: row.id,
          routing: 'hidden',
          direction: 'down',
        },
        ...row.layout.edges.map((edge) => ({ ...edge, routing: 'orthogonal' as const })),
      )
      result.decorations?.push({
        id: `cell-${row.id}`,
        kind: 'cell',
        topicId: row.id,
        x: left,
        y,
        width: column.width,
        height,
      })
      y += height
    }
    left += column.width
  }
  // Full-width row rules complete empty cells while keeping sparse matrices linear in size.
  let rowBoundary = top + headerHeight
  for (const [index, height] of rowHeights.entries()) {
    rowBoundary += height
    result.decorations?.push({
      id: `matrix-row-${root.id}-${index}`,
      kind: 'grid-line',
      topicId: root.id,
      direction: 'right',
      x: -width / 2,
      y: rowBoundary,
      width,
      height: 0,
    })
  }
  return result
}
