import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/contracts'

export function installMenu(send: (action: MenuAction) => void): void {
  const action = (label: string, value: MenuAction, accelerator: string) => ({
    label,
    accelerator,
    click: () => {
      send(value)
    },
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        action('新建', 'new', 'CmdOrCtrl+N'),
        action('打开…', 'open', 'CmdOrCtrl+O'),
        action('保存', 'save', 'CmdOrCtrl+S'),
        action('另存为…', 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        action('撤销', 'undo', 'CmdOrCtrl+Z'),
        action('重做', 'redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ]
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Trelyx',
      submenu: [
        { role: 'about', label: '关于 Trelyx' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Trelyx' },
      ],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
