import { useMessages } from '@renderer/i18n/useMessages'

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

export const KeyboardShortcutsContent = () => {
  const { translate, translateLabel } = useMessages()
  const groups = [
    [
      'settingsShortcutEditing',
      [...shortcuts.slice(0, 7), ...shortcuts.slice(10, 11), ...shortcuts.slice(15, 16)],
    ],
    ['settingsShortcutNavigation', [...shortcuts.slice(7, 10), ...shortcuts.slice(16)]],
    ['settingsShortcutFiles', shortcuts.slice(11, 15)],
  ] as const
  return (
    <div className="space-y-5 pb-1">
      {groups.map(([title, entries]) => (
        <section key={title} className="space-y-2">
          <h3 className="text-xs font-semibold text-foreground">{translate(title)}</h3>
          <dl className="divide-y divide-border/70">
            {entries.map(([keys, description]) => (
              <div
                key={keys}
                className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2.5 text-xs"
              >
                <dt className="min-w-0 flex-1 basis-52 leading-5 text-muted-foreground">
                  {translateLabel(description)}
                </dt>
                <dd className="shrink-0">
                  <kbd className="inline-flex min-h-6 items-center rounded border border-border bg-secondary/70 px-2 font-sans text-[11px] font-medium whitespace-nowrap text-foreground">
                    {translateLabel(keys)}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        {translate('onWindowslinuxUseCtrlForAndAlt')}
      </p>
    </div>
  )
}
