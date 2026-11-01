export const workflowPolishMessages = {
  pinDocumentDock: ['固定文档标签', 'Pin document tabs'],
  unpinDocumentDock: ['自动收起文档标签', 'Auto-hide document tabs'],
  pinCanvasDock: ['固定画布工具栏', 'Pin canvas toolbar'],
  unpinCanvasDock: ['自动收起画布工具栏', 'Auto-hide canvas toolbar'],
  currentMapDockCaption: [
    '{{title}}{{dirty}} · {{count}} 份导图',
    '{{title}}{{dirty}} · {{count}} maps',
  ],
  quickBlankMap: ['空白导图', 'Blank map'],
  quickBlankMapHint: ['直接开始编辑中心主题', 'Start editing the central topic'],
  topicStyleActions: ['复制与应用样式', 'Copy and apply style'],
  pasteStyleToCount: [
    '粘贴样式到选中主题（{{count}}）',
    'Paste style to selected topics ({{count}})',
  ],
  applyStyleToLevel: [
    '应用到同层主题（{{count}}）',
    'Apply to topics at the same depth ({{count}})',
  ],
  applyStyleToDescendants: ['应用到后代主题（{{count}}）', 'Apply to descendants ({{count}})'],
} as const
