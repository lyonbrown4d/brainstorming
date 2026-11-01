import { getParentId, type MindMapDocument } from '@core'

export interface OutlineRow {
  readonly id: string
  readonly parentId: string | null
  readonly depth: number
  readonly siblingIndex: number
  readonly siblingCount: number
}

/** Expand the path to the shared selection without changing canvas collapse commands. */
export const outlineRows = (
  document: MindMapDocument,
  collapsed: readonly string[],
  selectedId: string,
): readonly OutlineRow[] => {
  const ancestors = new Set<string>()
  for (let id = getParentId(document, selectedId); id; id = getParentId(document, id))
    ancestors.add(id)
  const hidden = new Set(collapsed.filter((id) => !ancestors.has(id)))
  const floating = new Set(document.floatingIds ?? [])
  const roots = [document.rootId, ...(document.floatingIds ?? [])]
  const stack: OutlineRow[] = roots
    .map((id, siblingIndex) => ({
      id,
      parentId: null,
      depth: 0,
      siblingIndex,
      siblingCount: roots.length,
    }))
    .reverse()
  const rows: OutlineRow[] = []
  while (stack.length) {
    const row = stack.pop()
    if (!row) break
    const topic = document.topics[row.id]
    if (!topic) continue
    rows.push(row)
    if (hidden.has(row.id)) continue
    const children =
      row.id === document.rootId ? topic.children.filter((id) => !floating.has(id)) : topic.children
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const id = children[index]
      if (id)
        stack.push({
          id,
          parentId: row.id,
          depth: row.depth + 1,
          siblingIndex: index,
          siblingCount: children.length,
        })
    }
  }
  return rows
}
