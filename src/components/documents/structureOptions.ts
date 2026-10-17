import type { MessageKey, MessageTranslator } from '@renderer/i18n'
import type { LayoutKind } from '@core'

export const structureOptions: readonly {
  value: LayoutKind
  label: string
  labelKey: MessageKey
}[] = [
  {
    value: 'map',
    label: '左右导图',
    labelKey: 'mindMap',
  },
  {
    value: 'logic-right',
    label: '向右逻辑图',
    labelKey: 'rightLogicChart',
  },
  {
    value: 'logic-left',
    label: '向左逻辑图',
    labelKey: 'leftLogicChart',
  },
  {
    value: 'org-down',
    label: '向下组织图',
    labelKey: 'downwardOrganizationChart',
  },
  {
    value: 'org-up',
    label: '向上组织图',
    labelKey: 'upwardOrganizationChart',
  },
  {
    value: 'tree-down',
    label: '向下树形图',
    labelKey: 'downwardTree',
  },
  {
    value: 'tree-up',
    label: '向上树形图',
    labelKey: 'upwardTree',
  },
  {
    value: 'brace-right',
    label: '向右括号图',
    labelKey: 'rightBraceMap',
  },
  {
    value: 'brace-left',
    label: '向左括号图',
    labelKey: 'leftBraceMap',
  },
  {
    value: 'fishbone',
    label: '鱼骨图',
    labelKey: 'fishbone',
  },
  {
    value: 'timeline',
    label: '水平时间线',
    labelKey: 'horizontalTimeline',
  },
  {
    value: 'timeline-vertical',
    label: '垂直时间线',
    labelKey: 'verticalTimeline',
  },
  {
    value: 'matrix',
    label: '矩阵',
    labelKey: 'matrix',
  },
  {
    value: 'tree-table-right',
    label: '向右树形表格',
    labelKey: 'rightTreeTable',
  },
  {
    value: 'tree-table-down',
    label: '向下树形表格',
    labelKey: 'downwardTreeTable',
  },
]

export const getStructureOptions = (translate: MessageTranslator) =>
  structureOptions.map(({ value, labelKey }) => ({ value, label: translate(labelKey) }))
