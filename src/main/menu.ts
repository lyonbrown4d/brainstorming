import type { AppLanguage } from '@shared/language'
import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/contracts'

export const installMenu = (
  send: (action: MenuAction) => void,
  language: AppLanguage = 'zh-CN',
): void => {
  const label = (zh: string, en: string) => (language === 'zh-CN' ? zh : en)
  const action = (label: string, value: MenuAction, accelerator: string) => ({
    label,
    accelerator,
    click: () => {
      send(value)
    },
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: label('文件', 'File'),
      submenu: [
        action(label('新建', 'New'), 'new', 'CmdOrCtrl+N'),
        action(label('打开…', 'Open…'), 'open', 'CmdOrCtrl+O'),
        action(label('保存', 'Save'), 'save', 'CmdOrCtrl+S'),
        action(label('另存为…', 'Save As…'), 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        action(label('关闭导图', 'Close map'), 'closeTab', 'CmdOrCtrl+W'),
        {
          role: 'close',
          label: label('关闭窗口', 'Close window'),
          accelerator: 'CmdOrCtrl+Shift+W',
        },
      ],
    },
    {
      label: label('编辑', 'Edit'),
      submenu: [
        action(label('撤销', 'Undo'), 'undo', 'CmdOrCtrl+Z'),
        action(label('重做', 'Redo'), 'redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        { role: 'cut', label: label('剪切', 'Cut') },
        { role: 'copy', label: label('复制', 'Copy') },
        { role: 'paste', label: label('粘贴', 'Paste') },
        { role: 'selectAll', label: label('全选', 'Select All') },
      ],
    },
    {
      label: label('视图', 'View'),
      submenu: [
        action(label('放大', 'Zoom In'), 'zoomIn', 'CmdOrCtrl+Plus'),
        action(label('缩小', 'Zoom Out'), 'zoomOut', 'CmdOrCtrl+-'),
        action(label('实际大小', 'Actual Size'), 'actualSize', 'CmdOrCtrl+0'),
        action(label('前往中心主题', 'Go to Central Topic'), 'centerRoot', 'CmdOrCtrl+R'),
        { role: 'togglefullscreen', label: label('全屏', 'Full Screen') },
      ],
    },
  ]
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Brainstorming',
      submenu: [
        { role: 'about', label: label('关于 Brainstorming', 'About Brainstorming') },
        { type: 'separator' },
        { role: 'quit', label: label('退出 Brainstorming', 'Quit Brainstorming') },
      ],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
