export const documentTabMessages = {
  mapTabShortcuts: ['下一份导图 / 上一份导图', 'Next map / previous map'],
  closeMapShortcuts: ['关闭当前导图 / 关闭窗口', 'Close current map / close window'],
  openMaps: ['打开的导图', 'Open maps'],
  expandMapTabs: ['展开导图标签栏', 'Expand map tabs'],
  newMapTab: ['新建导图标签', 'New map tab'],
  maxOpenMaps: [
    '最多同时打开 32 份导图，请先关闭一份。',
    'Up to 32 maps can be open. Close a map first.',
  ],
  closeMapTab: ['关闭导图 {{title}}', 'Close map {{title}}'],
  closeDirtyMap: [
    '导图“{{title}}”有未保存的更改，仍要关闭吗？',
    'Map “{{title}}” has unsaved changes. Close it?',
  ],
  previousMapTab: ['上一份导图', 'Previous map'],
  nextMapTab: ['下一份导图', 'Next map'],
  restoreMaps: ['恢复上次打开的 {{count}} 份导图', 'Restore {{count}} maps from the last session'],
  workspaceRecoveryFound: ['发现上次打开的导图', 'Previous workspace found'],
} as const
