export const outlineWorkspaceMessages = {
  outlineWorkspace: ['大纲工作区', 'Outline workspace'],
  outlineWorkspaceHint: [
    'Enter 新增同级 · Tab 缩进 · Shift+Tab 提升层级 · 拖动手柄整理',
    'Enter adds a sibling · Tab indents · Shift+Tab outdents · Drag handles to organize',
  ],
  outlineAddSibling: ['新增同级主题', 'Add sibling topic'],
  outlineAddChild: ['新增子主题', 'Add child topic'],
  outlineIndent: ['缩进主题', 'Indent topic'],
  outlineOutdent: ['提升主题层级', 'Outdent topic'],
  outlineDragTopic: ['拖动主题：{{title}}', 'Drag topic: {{title}}'],
  outlineDropBefore: ['移到主题之前', 'Move before topic'],
  outlineDropInside: ['移为子主题', 'Move into topic'],
  outlineDropAfter: ['移到主题之后', 'Move after topic'],
  outlineDragHint: [
    '拖至行的上沿或下沿排序，拖至中间移为子主题',
    'Drop at a row edge to reorder, or at its center to nest',
  ],
} as const
