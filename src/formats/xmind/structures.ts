import type { LayoutKind } from '@core/extensions'
import type { Warnings } from '@formats/xmind/common'

/** IDs published by the official XMind viewer; never synthesize a structure-class ID.
 * https://github.com/xmindltd/xmind-viewer/blob/master/src/common/constants/structures.ts
 */
const structures: Readonly<Partial<Record<LayoutKind, string>>> = {
  map: 'org.xmind.ui.map.unbalanced',
  'logic-right': 'org.xmind.ui.logic.right',
  'logic-left': 'org.xmind.ui.logic.left',
  'org-down': 'org.xmind.ui.org-chart.down',
  'org-up': 'org.xmind.ui.org-chart.up',
  timeline: 'org.xmind.ui.timeline.horizontal',
  'timeline-vertical': 'org.xmind.ui.timeline.vertical',
  fishbone: 'org.xmind.ui.fishbone.leftHeaded',
}

export const importStructure = (value: unknown, warnings: Warnings): LayoutKind | undefined => {
  if (value === undefined) return undefined
  if (value === 'org.xmind.ui.map') return 'map'
  const found = Object.entries(structures).find(([, id]) => id === value)
  if (found) return found[0] as LayoutKind
  warnings.add('不支持的 XMind 布局已使用继承或默认布局，主题内容已保留')
  return undefined
}

/** Unsupported visual structures use a known standard fallback; the extension keeps the exact kind. */
export const exportStructure = (kind: LayoutKind): string => {
  if (structures[kind]) return structures[kind]
  // These preserve the broad reading direction only, not brace, tree or table geometry.
  switch (kind) {
    case 'tree-up':
      return 'org.xmind.ui.org-chart.up'
    case 'tree-down':
    case 'tree-table-down':
      return 'org.xmind.ui.org-chart.down'
    case 'brace-left':
      return 'org.xmind.ui.logic.left'
    default:
      return 'org.xmind.ui.logic.right'
  }
}
