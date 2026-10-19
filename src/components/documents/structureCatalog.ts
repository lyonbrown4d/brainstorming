import type { LayoutKind } from '@core'
import type { MessageKey, MessageTranslator } from '@renderer/i18n'
import { structureOptions } from '@renderer/components/documents/structureOptions'

export const structureGroups = [
  {
    id: 'thought',
    label: 'presetThought',
    kinds: ['map', 'logic-right', 'logic-left'],
    keywords: '思维逻辑 thought',
  },
  {
    id: 'hierarchy',
    label: 'presetHierarchy',
    kinds: ['org-down', 'org-up', 'tree-down', 'tree-up'],
    keywords: '层级 hierarchy',
  },
  {
    id: 'analysis',
    label: 'presetAnalysis',
    kinds: ['brace-right', 'brace-left', 'fishbone'],
    keywords: '分析 归纳 analysis',
  },
  {
    id: 'time',
    label: 'presetTime',
    kinds: ['timeline', 'timeline-vertical'],
    keywords: '时间 计划 time plan',
  },
  {
    id: 'table',
    label: 'presetTable',
    kinds: ['matrix', 'tree-table-right', 'tree-table-down'],
    keywords: '表格 table',
  },
] as const satisfies readonly {
  id: string
  label: MessageKey
  kinds: readonly LayoutKind[]
  keywords: string
}[]
export type StructureGroup = 'all' | (typeof structureGroups)[number]['id']
export const isStructureGroup = (value: string): value is StructureGroup =>
  value === 'all' || structureGroups.some((group) => group.id === value)
export const structureGroupFor = (kind?: LayoutKind): StructureGroup =>
  structureGroups.find((group) => group.kinds.some((value) => value === kind))?.id ?? 'thought'

/** Search both interface labels and bilingual diagram terminology; the catalogue stays independent of documents. */
const aliases: Record<LayoutKind, string> = {
  map: '思维导图 mind map brainstorm',
  'logic-right': 'logic chart right',
  'logic-left': 'logic chart left',
  'org-down': '组织图 organization org chart down',
  'org-up': '组织图 organization org chart up',
  'tree-down': '树形 tree down',
  'tree-up': '树形 tree up',
  'brace-right': '括号 brace right',
  'brace-left': '括号 brace left',
  fishbone: '鱼骨 因果 fishbone cause',
  timeline: '时间线 horizontal timeline',
  'timeline-vertical': '时间线 vertical timeline',
  matrix: '矩阵 matrix',
  'tree-table-right': '树形表格 tree table right',
  'tree-table-down': '树形表格 tree table down',
}
export const filterStructureGroups = (
  translate: MessageTranslator,
  group: StructureGroup,
  query: string,
) => {
  const terms = query.trim().normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean)
  return structureGroups
    .filter((item) => terms.length > 0 || group === 'all' || item.id === group)
    .map((item) => ({
      id: item.id,
      label: translate(item.label),
      options: structureOptions
        .filter((option) => {
          if (!item.kinds.some((kind) => kind === option.value)) return false
          const searchable =
            `${translate(option.labelKey)} ${option.label} ${option.value} ${option.value.replaceAll('-', ' ')} ${aliases[option.value]} ${item.keywords}`
              .normalize('NFKC')
              .toLowerCase()
          return terms.every((term) => searchable.includes(term))
        })
        .map((option) => ({ value: option.value, label: translate(option.labelKey) })),
    }))
    .filter((item) => item.options.length > 0)
}
