import { Label } from '@renderer/components/ui/label'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useId, useState } from 'react'
import { Palette, Plus } from 'lucide-react'
import type { DocumentPalette } from '@core/extensions'
import type { DocumentSettings, TopicStyle } from '@core'
import { findPalette, type PaletteId } from '@shared/palettes'
import { useEditor } from '@renderer/state/editor'
import { updateSelectedStyle } from '@renderer/state/selection'
import { defaultTopicStyle } from '@renderer/lib/topicAppearance'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { PaletteChooser } from '@renderer/components/appearance/PaletteChooser'
import { CustomPaletteEditor } from '@renderer/components/appearance/CustomPaletteEditor'

export const DocumentSettingsPanel = () => {
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const busy = useEditor((state) => state.busy)
  const [copiedStyle, setCopiedStyle] = useState<TopicStyle | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('presets')
  const backgroundId = useId()
  const settings = document.settings ?? {}
  const basePalette = findPalette(settings.theme)
  const update = (patch: DocumentSettings): void => {
    if (useEditor.getState().busy) return
    runAnnotationCommand({
      type: 'setDocumentSettings',
      settings: { ...useEditor.getState().history.document.settings, ...patch },
    })
  }
  const selectPalette = (theme: PaletteId, customPalette?: DocumentPalette): void => {
    if (useEditor.getState().busy) return
    const current = { ...useEditor.getState().history.document.settings }
    delete current.background
    delete current.customPalette
    runAnnotationCommand({
      type: 'setDocumentSettings',
      settings: { ...current, theme, ...(customPalette ? { customPalette } : {}) },
    })
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTab('presets')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="布局与主题" disabled={busy}>
          <Palette className="size-4" />
          配色
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        aria-label="布局与主题"
        className="max-h-[min(680px,var(--radix-popover-content-available-height))] w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border bg-popover p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">导图配色</h2>
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(value) => {
              if (value) setTab(value)
            }}
            size="sm"
            aria-label="配色类型"
          >
            <ToggleGroupItem value="presets" aria-label="预设配色">
              预设
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" aria-label="自定义配色">
              自定义
            </ToggleGroupItem>
            <ToggleGroupItem value="settings" aria-label="字体与线条">
              更多
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {tab === 'presets' ? (
          <>
            <ScrollArea type="always" className="h-44">
              <PaletteChooser
                settings={settings}
                onSelect={(id) => {
                  selectPalette(id)
                }}
              />
            </ScrollArea>
            <Button
              variant="ghost"
              className="mt-2 w-full text-muted-foreground"
              onClick={() => {
                setTab('custom')
              }}
            >
              <Plus className="size-4" />
              自定义
            </Button>
          </>
        ) : tab === 'settings' ? (
          <div className="grid gap-3 text-sm">
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={backgroundId}>背景颜色</Label>
              <Input
                id={backgroundId}
                aria-label="画布背景颜色"
                type="color"
                className="h-9 w-20 p-1"
                value={
                  settings.background ??
                  settings.customPalette?.background ??
                  findPalette(settings.theme).background
                }
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
            <div className="flex gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                onClick={() => {
                  setCopiedStyle({
                    ...defaultTopicStyle(document, selectedId),
                    ...document.topics[selectedId]?.style,
                  })
                }}
              >
                复制主题样式
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
        ) : (
          <CustomPaletteEditor
            initial={
              settings.customPalette ?? {
                name: '自定义',
                root: basePalette.root,
                branches: basePalette.branches,
                background: settings.background ?? basePalette.background,
              }
            }
            onSave={(palette) => {
              selectPalette(settings.theme ?? 'trelyx', palette)
              setOpen(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
