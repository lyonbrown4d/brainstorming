import { useMessages } from '@renderer/i18n/useMessages'
import {
  fontSizes,
  lineWidths,
  getTopicFormattingOptions,
  type ColorOption,
} from '@renderer/components/topicFormattingOptions'

import { Bold, Italic, MoreHorizontal } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type TopicStyle } from '@core'
import { defaultTopicStyle } from '@renderer/lib/topicAppearance'
import { useEditor } from '@renderer/state/editor'
import { updateSelectedStyle } from '@renderer/state/selection'
import { Button } from '@renderer/components/ui/button'
import { FieldSelect } from '@renderer/components/FieldSelect'

const ColorPalette = ({
  colors,
  value,
  label,
  onChange,
}: {
  colors: readonly ColorOption[]
  value: string
  label: string
  onChange: (value: string) => void
}) => {
  return (
    <div className="color-palette flex items-center gap-2" role="group" aria-label={label}>
      {colors.map((color) => (
        <Button
          variant="ghost"
          size="icon"
          key={color.value}
          className="color-swatch size-8 shrink-0 rounded-[7px] border border-foreground/5 p-0 hover:-translate-y-px aria-pressed:outline-2 aria-pressed:outline-offset-[3px] aria-pressed:outline-ring motion-reduce:hover:translate-y-0"
          type="button"
          aria-label={`${label}：${color.name}`}
          aria-pressed={value.toLowerCase() === color.value}
          title={color.name}
          style={{ background: color.value }}
          onClick={() => {
            onChange(color.value)
          }}
        />
      ))}
    </div>
  )
}

export const TopicFormatting = ({
  compact = false,
  topicId,
}: {
  compact?: boolean
  topicId?: string
}) => {
  const { translate } = useMessages()
  const { shapeOptions, lineOptions, fillColors, textColors } = getTopicFormattingOptions(translate)

  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const topic = document.topics[topicId ?? selectedId]
  if (!topic) return null
  const defaults = defaultTopicStyle(document, topic.id)
  const style = topic.style ?? {}
  const fontSize = style.fontSize ?? defaults.fontSize
  const bold = style.bold ?? defaults.bold
  const fill = style.fill ?? defaults.fill
  const color = style.color ?? defaults.color
  const update = (patch: TopicStyle): void => {
    updateSelectedStyle(patch, topic.id)
  }
  const sizeControl = (
    <FieldSelect
      className={
        compact
          ? 'font-size-select w-[49px] border-0 bg-transparent px-0.5 data-[size=default]:h-[29px]'
          : 'font-size-select w-[60px] flex-1'
      }
      label={translate('fontSize')}
      value={String(fontSize)}
      options={fontSizes}
      onChange={(value) => {
        update({ fontSize: Number(value) })
      }}
    />
  )
  const boldControl = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={translate('bold')}
      aria-pressed={bold}
      onClick={() => {
        update({ bold: !bold })
      }}
    >
      <Bold size={18} />
    </Button>
  )
  if (compact)
    return (
      <div
        className="topic-context-toolbar nodrag nopan flex items-center rounded-[10px] border border-border bg-background px-[7px] py-[5px] shadow-[0_5px_16px_#352d4d0d] [&_[data-slot=button]]:h-[29px] [&_[data-slot=button]]:w-[31px]"
        role="toolbar"
        aria-label={translate('topicFormatting')}
      >
        {sizeControl}
        <span className="mx-[5px] h-[19px] w-px shrink-0 bg-border" />
        {boldControl}
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label={translate('topicFill')}>
              <span
                className="current-fill block size-5 rounded-full border border-foreground/10"
                style={{ background: fill }}
              />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="formatting-popover color-popover z-[65] w-auto rounded-xl border border-border bg-popover p-3.5 shadow-[0_6px_24px_#352d4d12]"
              side="top"
              sideOffset={10}
              aria-label={translate('fillColor')}
            >
              <ColorPalette
                colors={fillColors}
                value={fill}
                label={translate('fill')}
                onChange={(value) => {
                  update({ fill: value })
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <span className="mx-[5px] h-[19px] w-px shrink-0 bg-border" />
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label={translate('moreTopicStyles')}>
              <MoreHorizontal size={20} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="formatting-popover z-[65] w-[250px] rounded-xl border border-border bg-popover px-4 shadow-[0_6px_24px_#352d4d12] [&_.format-group:first-child]:mt-0 [&_.format-group:first-child]:border-t-0"
              side="top"
              sideOffset={10}
              align="end"
              aria-label={translate('moreTopicStyles')}
            >
              <TopicFormatting topicId={topic.id} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    )
  return (
    <div className="topic-formatting">
      <section className="format-group border-t border-border py-4 first:mt-4 [&_h3]:mb-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-secondary-foreground [&_h3:not(:first-child)]:mt-[18px]">
        <h3>{translate('appearance')}</h3>
        <span className="mb-2 block text-xs text-muted-foreground">{translate('shape')}</span>
        <div className="select-control relative flex items-center [&_.field-select]:w-full [&_.field-select]:pr-8 [&_.field-select]:pl-11">
          <span
            className={`shape-preview pointer-events-none absolute left-3 h-[15px] w-[22px] border-[1.5px] border-secondary-foreground ${style.shape === 'ellipse' ? 'rounded-full' : style.shape === 'rectangle' ? 'rounded-none' : 'rounded'}`}
          />
          <FieldSelect
            label={translate('topicShape')}
            value={style.shape ?? 'rounded'}
            options={shapeOptions}
            onChange={(value) => {
              update({ shape: value })
            }}
          />
        </div>
        <h3>{translate('fill')}</h3>
        <ColorPalette
          colors={fillColors}
          value={fill}
          label={translate('fill')}
          onChange={(value) => {
            update({ fill: value })
          }}
        />
      </section>
      <section className="format-group border-t border-border py-4 first:mt-4 [&_h3]:mb-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-secondary-foreground [&_h3:not(:first-child)]:mt-[18px]">
        <h3>{translate('text')}</h3>
        <div className="font-controls mb-[15px] flex items-end gap-2 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:w-[35px] [&_[data-slot=button]]:border [&_[data-slot=button]]:border-border [&_[data-slot=button]]:bg-background [&_[data-slot=button][aria-pressed=true]]:border-primary/20 [&_[data-slot=button][aria-pressed=true]]:bg-accent [&_[data-slot=button][aria-pressed=true]]:text-accent-foreground">
          <div className="format-field flex flex-1 items-center gap-2.5 text-xs text-muted-foreground">
            <span>{translate('fontSize')}</span>
            {sizeControl}
          </div>
          {boldControl}
          <Button
            variant="ghost"
            size="icon"
            aria-label={translate('italic')}
            aria-pressed={style.italic ?? false}
            onClick={() => {
              update({ italic: !style.italic })
            }}
          >
            <Italic size={18} />
          </Button>
        </div>
        <span className="format-label mb-2.5 block text-xs text-muted-foreground">
          {translate('textColor')}
        </span>
        <ColorPalette
          colors={textColors}
          value={color}
          label={translate('textColor')}
          onChange={(value) => {
            update({ color: value })
          }}
        />
      </section>
      <section className="format-group border-t border-border py-4 first:mt-4 [&_h3]:mb-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-secondary-foreground [&_h3:not(:first-child)]:mt-[18px]">
        <h3>{translate('branch')}</h3>
        <div className="branch-controls flex gap-2.5 [&_.format-field]:flex [&_.format-field]:flex-1 [&_.format-field]:flex-col [&_.format-field]:gap-2 [&_.format-field]:text-[11px] [&_.format-field]:text-muted-foreground [&_.field-select]:w-full">
          <div className="format-field">
            <span>{translate('lineStyle')}</span>
            <FieldSelect
              label={translate('branchLineStyle')}
              value={style.lineStyle ?? 'curve'}
              options={lineOptions}
              onChange={(value) => {
                update({ lineStyle: value })
              }}
            />
          </div>
          <div className="format-field">
            <span>{translate('width')}</span>
            <FieldSelect
              label={translate('branchWidth')}
              value={String(style.lineWidth ?? defaults.lineWidth)}
              options={lineWidths}
              onChange={(value) => {
                update({ lineWidth: Number(value) })
              }}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
