import { useMessages } from '@renderer/i18n/useMessages'

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

export const DocumentSettingsPanel = ({ inline = false }: { inline?: boolean }) => {
  const { translate } = useMessages()

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
  const content = (
    <>
      <div className={inline ? 'mb-3 grid gap-3' : 'mb-3 flex items-center justify-between gap-2'}>
        <h2 className="text-sm font-semibold">{translate('mapColors')}</h2>
        <ToggleGroup
          type="single"
          value={tab}
          onValueChange={(value) => {
            if (value) setTab(value)
          }}
          size="sm"
          aria-label={translate('colorSchemeType')}
        >
          <ToggleGroupItem value="presets" aria-label={translate('presetColors')}>
            {translate('presets')}
          </ToggleGroupItem>
          <ToggleGroupItem value="custom" aria-label={translate('customColors')}>
            {translate('custom')}
          </ToggleGroupItem>
          <ToggleGroupItem value="settings" aria-label={translate('fontsAndLines')}>
            {translate('more')}
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
            {translate('custom')}
          </Button>
        </>
      ) : tab === 'settings' ? (
        <div className="grid gap-3 text-sm">
          <FieldSelect
            label={translate('mapFont')}
            value={settings.fontFamily ?? 'system-ui, sans-serif'}
            options={[
              { value: 'system-ui, sans-serif', label: translate('systemFont') },
              { value: 'serif', label: translate('serif') },
              { value: 'sans-serif', label: translate('sansSerif') },
              { value: 'monospace', label: translate('monospace') },
            ]}
            onChange={(fontFamily) => {
              update({ fontFamily })
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={backgroundId}>{translate('backgroundColor')}</Label>
            <Input
              id={backgroundId}
              aria-label={translate('canvasBackgroundColor')}
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
            label={translate('defaultBranchWidth')}
            value={String(settings.lineWidth ?? 2)}
            options={[1, 2, 3, 4, 5, 6].map((value) => ({
              value: String(value),
              label: `${value} px`,
            }))}
            onChange={(value) => {
              update({ lineWidth: Number(value) })
            }}
          />
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setCopiedStyle({
                  ...defaultTopicStyle(document, selectedId),
                  ...document.topics[selectedId]?.style,
                })
              }}
            >
              {translate('copyTopicStyle')}
            </Button>
            <Button
              variant="outline"
              disabled={!copiedStyle}
              onClick={() => {
                if (copiedStyle) updateSelectedStyle(copiedStyle)
              }}
            >
              {translate('pasteOntoSelectedTopics')}
            </Button>
          </div>
        </div>
      ) : (
        <CustomPaletteEditor
          initial={
            settings.customPalette ?? {
              name: translate('custom'),
              root: basePalette.root,
              branches: basePalette.branches,
              background: settings.background ?? basePalette.background,
            }
          }
          onSave={(palette) => {
            selectPalette(settings.theme ?? 'trelyx', palette)
            if (inline) setTab('presets')
            else setOpen(false)
          }}
        />
      )}
    </>
  )
  if (inline)
    return (
      <section
        className="border-t border-border py-4 [&_[data-palette-options]]:grid-cols-2 [&_form>.grid]:grid-cols-1"
        aria-label={translate('layoutAndTheme')}
      >
        {content}
      </section>
    )
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTab('presets')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={translate('layoutAndTheme')}
          disabled={busy}
        >
          <Palette className="size-4" />
          {translate('colors')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        aria-label={translate('layoutAndTheme')}
        className="max-h-[min(680px,var(--radix-popover-content-available-height))] w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border bg-popover p-4 shadow-lg"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
