import { CircleHelp } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'

const shortcuts = [
  ['Tab / Enter', '添加子主题 / 同级主题'],
  ['↑ ↓ ← →', '在主题之间导航'],
  ['Delete', '删除当前分支'],
  ['⌘ Z / ⇧⌘ Z', '撤销 / 重做'],
  ['⌘ S / ⌘ O / ⌘ N', '保存 / 打开 / 新建'],
  ['Shift + Enter', '编辑时换行'],
] as const

export function KeyboardHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="键盘快捷键">
          <CircleHelp size={14} /> 快捷键
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel="关闭快捷键">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>
            让思考保持流动。选中主题后直接输入文字，或按 F2 编辑。
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-4 text-xs">
          {shortcuts.map(([keys, description]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-secondary px-2 py-1">{keys}</kbd>
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Windows / Linux 使用 Ctrl 代替 ⌘。</p>
      </DialogContent>
    </Dialog>
  )
}
