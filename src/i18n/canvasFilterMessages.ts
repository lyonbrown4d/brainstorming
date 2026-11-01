export const canvasFilterMessages = {
  canvasFilterMode: ['画布显示', 'Canvas display'],
  filterResultsOnly: ['仅列出结果', 'List results only'],
  filterMatchingBranches: ['只显示匹配主题与祖先', 'Show matches and ancestors'],
  canvasFilterActive: [
    '筛选中：{{count}} 个匹配主题，保留祖先路径',
    'Filtered: {{count}} matches, with ancestor paths',
  ],
  canvasFilterEmpty: [
    '没有匹配主题；中心主题仍保留',
    'No matches; the central topic remains visible',
  ],
  exitCanvasFilter: ['退出筛选', 'Exit filter'],
} as const
