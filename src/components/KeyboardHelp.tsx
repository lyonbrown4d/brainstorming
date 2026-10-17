import { useMessages } from '@renderer/i18n/useMessages'

import { DialogContent } from '@renderer/components/DialogContent'
import { CircleHelp } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

const shortcuts = [
  ['Tab / Enter', '添加子主题 / 同级主题（编辑中 Enter 确认）'],
  ['Space / 双击', '编辑：占位文字全选，已有文字从末尾续写'],
  ['F2 / 直接输入', '全选编辑 / 替换主题文字'],
  ['⌘ Enter', '在当前主题上方插入父主题'],
  ['⌘ Backspace', '删除当前主题，保留子主题'],
  ['⌥ ↑ / ↓', '调整同级主题顺序'],
  ['⌘ /', '折叠 / 展开子主题'],
  ['⌘ R', '前往中心主题'],
  ['⌘ + / − / 0', '放大 / 缩小 / 实际大小'],
  ['↑ ↓ ← →', '在主题之间导航'],
  ['Delete / Backspace', '删除选中的主题分支或注解'],
  ['⌘ Z / ⇧⌘ Z', '撤销 / 重做'],
  ['⌘ S / ⌘ O / ⌘ N', '保存 / 打开 / 新建'],
  ['Ctrl Tab / Ctrl Shift Tab', '下一份导图 / 上一份导图'],
  ['⌘ W / ⇧⌘ W', '关闭当前导图 / 关闭窗口'],
  ['Shift + Enter', '编辑时换行'],
  ['拖动画布空白', '平移画布；按住 Shift 拖动框选主题'],
] as const

export const KeyboardHelp = () => {
  const { translate, translateLabel } = useMessages()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={translate('keyboardShortcuts')}>
          <CircleHelp size={14} />
          {translate('shortcuts')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={translate('closeShortcuts')}>
        <DialogHeader>
          <DialogTitle>{translate('keyboardShortcuts')}</DialogTitle>
          <DialogDescription>{translate('clickToSelectATopicWhileEditing')}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-4 text-xs">
          {shortcuts.map(([keys, description]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-secondary px-2 py-1">
                  {translateLabel(keys)}
                </kbd>
              </dt>
              <dd>{translateLabel(description)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {translate('onWindowslinuxUseCtrlForAndAlt')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
