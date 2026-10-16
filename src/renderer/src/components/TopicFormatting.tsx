import { Bold, ChevronDown, Italic, MoreHorizontal } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type TopicStyle } from '@core'
import { defaultTopicStyle } from '../lib/topicAppearance'
import { useEditor } from '../state/editor'
import { Button } from './ui/button'

const fillColors = [
  { value: '#ffc7c7', name: '珊瑚' },
  { value: '#bcecdf', name: '薄荷' },
  { value: '#ffe0a3', name: '暖黄' },
  { value: '#d9d3fa', name: '淡紫' },
  { value: '#ffffff', name: '白色' },
]
const textColors = [
  { value: '#30313b', name: '墨色' },
  { value: '#7666c4', name: '紫色' },
  { value: '#397a6c', name: '青绿' },
  { value: '#b35f55', name: '砖红' },
  { value: '#ffffff', name: '白色' },
]

function ColorPalette({
  colors,
  value,
  label,
  onChange,
}: {
  colors: typeof fillColors
  value: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <div className="color-palette" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color.value}
          className="color-swatch"
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

export function TopicFormatting({
  compact = false,
  topicId,
}: {
  compact?: boolean
  topicId?: string
}) {
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
    const state = useEditor.getState()
    state.commitDraft()
    const current = useEditor.getState().history.document.topics[topic.id]
    if (current)
      state.command({
        type: 'setTopicStyle',
        topicId: topic.id,
        style: { ...current.style, ...patch },
      })
  }
  const sizeControl = (
    <select
      className="font-size-select"
      aria-label="字号"
      value={fontSize}
      onChange={(event) => {
        update({ fontSize: Number(event.target.value) })
      }}
    >
      {Array.from({ length: 21 }, (_, index) => index + 12).map((size) => (
        <option key={size} value={size}>
          {size}
        </option>
      ))}
    </select>
  )
  const boldControl = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="加粗"
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
      <div className="topic-context-toolbar nodrag nopan" role="toolbar" aria-label="主题格式">
        {sizeControl}
        <span className="toolbar-separator" />
        {boldControl}
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="主题填充">
              <span className="current-fill" style={{ background: fill }} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="formatting-popover color-popover"
              sideOffset={10}
              aria-label="填充颜色"
            >
              <ColorPalette
                colors={fillColors}
                value={fill}
                label="填充"
                onChange={(value) => {
                  update({ fill: value })
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <span className="toolbar-separator" />
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="更多主题样式">
              <MoreHorizontal size={20} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="formatting-popover"
              sideOffset={10}
              align="end"
              aria-label="更多主题样式"
            >
              <TopicFormatting topicId={topic.id} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    )
  return (
    <div className="topic-formatting">
      <section className="format-group">
        <h3>形状</h3>
        <div className="select-control">
          <span className={`shape-preview shape-${style.shape ?? 'rounded'}`} />
          <select
            aria-label="主题形状"
            value={style.shape ?? 'rounded'}
            onChange={(event) => {
              update({ shape: event.target.value as NonNullable<TopicStyle['shape']> })
            }}
          >
            <option value="rounded">圆角矩形</option>
            <option value="rectangle">矩形</option>
            <option value="ellipse">椭圆</option>
          </select>
          <ChevronDown size={15} />
        </div>
        <h3>填充</h3>
        <ColorPalette
          colors={fillColors}
          value={fill}
          label="填充"
          onChange={(value) => {
            update({ fill: value })
          }}
        />
      </section>
      <section className="format-group">
        <h3>文本</h3>
        <div className="font-controls">
          <label>字号{sizeControl}</label>
          {boldControl}
          <Button
            variant="ghost"
            size="icon"
            aria-label="斜体"
            aria-pressed={style.italic ?? false}
            onClick={() => {
              update({ italic: !style.italic })
            }}
          >
            <Italic size={18} />
          </Button>
        </div>
        <span className="format-label">文字颜色</span>
        <ColorPalette
          colors={textColors}
          value={color}
          label="文字颜色"
          onChange={(value) => {
            update({ color: value })
          }}
        />
      </section>
      <section className="format-group">
        <h3>分支</h3>
        <div className="branch-controls">
          <label>
            线型
            <select
              aria-label="分支线型"
              value={style.lineStyle ?? 'curve'}
              onChange={(event) => {
                update({ lineStyle: event.target.value as NonNullable<TopicStyle['lineStyle']> })
              }}
            >
              <option value="curve">曲线</option>
              <option value="straight">直线</option>
            </select>
          </label>
          <label>
            粗细
            <select
              aria-label="分支粗细"
              value={style.lineWidth ?? defaults.lineWidth}
              onChange={(event) => {
                update({ lineWidth: Number(event.target.value) })
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((width) => (
                <option key={width} value={width}>
                  {width} px
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </div>
  )
}
