import type { LayoutKind } from '@core'

export const structureOptions: readonly { value: LayoutKind; label: string }[] = [
  { value: 'map', label: '左右导图' },
  { value: 'logic-right', label: '向右逻辑图' },
  { value: 'logic-left', label: '向左逻辑图' },
  { value: 'org-down', label: '向下组织图' },
  { value: 'org-up', label: '向上组织图' },
  { value: 'tree-down', label: '向下树形图' },
  { value: 'tree-up', label: '向上树形图' },
  { value: 'brace-right', label: '向右括号图' },
  { value: 'brace-left', label: '向左括号图' },
  { value: 'fishbone', label: '鱼骨图' },
  { value: 'timeline', label: '水平时间线' },
  { value: 'timeline-vertical', label: '垂直时间线' },
  { value: 'matrix', label: '矩阵' },
  { value: 'tree-table-right', label: '向右树形表格' },
  { value: 'tree-table-down', label: '向下树形表格' },
]
