import { useState } from 'react'
import { Palette } from 'lucide-react'
import type { DocumentSettings, TopicStyle } from '@core'
import { useEditor } from '@renderer/state/editor'
import { updateSelectedStyle } from '@renderer/state/selection'
import { defaultTopicStyle } from '@renderer/lib/topicAppearance'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { Popover } from 'radix-ui'

export const DocumentSettingsPanel = () => {
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const [copiedStyle, setCopiedStyle] = useState<TopicStyle | null>(null)
  const settings = document.settings ?? {}
  const update = (patch: DocumentSettings): void => {
    runAnnotationCommand({
      type: 'setDocumentSettings',
      settings: { ...useEditor.getState().history.document.settings, ...patch },
    })
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Palette className="size-4" />
          布局与主题
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          className="z-50 max-h-[75vh] w-80 overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg"
          aria-label="布局与主题"
        >
          <div className="mb-4 space-y-2">
            <h2 className="text-sm font-semibold">布局与主题</h2>
            <p className="text-xs text-muted-foreground">
              配色、字体和全局外观保存于当前画布，可撤销。
            </p>
          </div>
          <div className="grid gap-3 text-sm">
            <span>主题配色</span>
            <FieldSelect
              label="主题配色"
              value={settings.theme ?? 'trelyx'}
              options={[
                { value: 'trelyx', label: 'Trelyx' },
                { value: 'ocean', label: '海洋' },
                { value: 'forest', label: '森林' },
                { value: 'sunset', label: '落日' },
                { value: 'mono', label: '灰阶' },
              ]}
              onChange={(theme) => {
                update({ theme })
              }}
            />
            <span>全局字体</span>
            <FieldSelect
              label="全局字体"
              value={settings.fontFamily ?? 'system-ui, sans-serif'}
              options={[
                { value: 'system-ui, sans-serif', label: '系统字体' },
                { value: 'serif', label: '衬线字体' },
                { value: 'sans-serif', label: '无衬线字体' },
                { value: 'monospace', label: '等宽字体' },
              ]}
              onChange={(fontFamily) => {
                update({ fontFamily })
              }}
            />
            <div className="flex items-center gap-3">
              <span>背景颜色</span>
              <Input
                aria-label="画布背景颜色"
                type="color"
                className="h-9 w-20 p-1"
                value={settings.background ?? '#fcfcfa'}
                onChange={(event) => {
                  update({ background: event.target.value })
                }}
              />
            </div>
            <FieldSelect
              label="全局分支线宽"
              value={String(settings.lineWidth ?? 2)}
              options={[1, 2, 3, 4, 5, 6].map((value) => ({
                value: String(value),
                label: `${value} px`,
              }))}
              onChange={(value) => {
                update({ lineWidth: Number(value) })
              }}
            />
            <div className="flex gap-2 border-t pt-3">
              <Button
                variant="outline"
                onClick={() => {
                  setCopiedStyle({
                    ...defaultTopicStyle(document, selectedId),
                    ...document.topics[selectedId]?.style,
                  })
                }}
              >
                复制所选主题样式
              </Button>
              <Button
                variant="outline"
                disabled={!copiedStyle}
                onClick={() => {
                  if (copiedStyle) updateSelectedStyle(copiedStyle)
                }}
              >
                粘贴到所选主题
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
