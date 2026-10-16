import { useState } from 'react'
import { Popover } from 'radix-ui'
import { Paintbrush, Trash2 } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { useAnnotationInteraction } from '../../state/annotationInteraction'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { FieldSelect } from '../FieldSelect'
import { runAnnotationCommand } from './commands'

function AnnotationStyleForm({ id, kind }: { id: string; kind: 'relation' | 'group' | 'callout' }) {
  const document = useEditor((state) => state.history.document)
  const item =
    kind === 'relation'
      ? document.relations?.find((entry) => entry.id === id)
      : kind === 'group'
        ? document.groups?.find((entry) => entry.id === id)
        : document.callouts?.find((entry) => entry.id === id)
  const [color, setColor] = useState(
    item && 'color' in item ? (item.color ?? '#8b79d9') : '#8b79d9',
  )
  const [arrow, setArrow] = useState(item && 'arrow' in item ? (item.arrow ?? 'end') : 'end')
  const [dashed, setDashed] = useState(item && 'dashed' in item ? (item.dashed ?? false) : false)
  const [width, setWidth] = useState(String(item && 'width' in item ? (item.width ?? 2) : 2))
  if (!item) return null
  const save = (): void => {
    if ('from' in item)
      runAnnotationCommand({
        type: 'upsertRelation',
        relation: { ...item, color, arrow, dashed, width: Number(width) },
      })
    else if ('topicIds' in item)
      runAnnotationCommand({ type: 'upsertGroup', group: { ...item, color } })
  }
  const remove = (): void => {
    if (kind === 'relation') runAnnotationCommand({ type: 'removeRelation', relationId: id })
    else if (kind === 'group') runAnnotationCommand({ type: 'removeGroup', groupId: id })
    else runAnnotationCommand({ type: 'removeCallout', calloutId: id })
    useAnnotationInteraction.setState({ selected: null, editing: false })
  }
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {kind !== 'callout' && (
        <>
          <span className="text-xs">注解颜色</span>
          <Input
            type="color"
            aria-label="注解颜色"
            value={color}
            onChange={(event) => {
              setColor(event.target.value)
            }}
          />
          {kind === 'relation' && (
            <>
              <FieldSelect
                label="关联线箭头"
                value={arrow}
                options={[
                  { value: 'none', label: '无箭头' },
                  { value: 'end', label: '单向' },
                  { value: 'both', label: '双向' },
                ]}
                onChange={setArrow}
              />
              <FieldSelect
                label="关联线宽度"
                value={width}
                options={[1, 2, 3, 4, 5, 6].map((value) => ({
                  value: String(value),
                  label: `${value} px`,
                }))}
                onChange={setWidth}
              />
              <Button
                type="button"
                variant="outline"
                aria-pressed={dashed}
                onClick={() => {
                  setDashed(!dashed)
                }}
              >
                虚线
              </Button>
            </>
          )}
          <Button type="submit" size="sm">
            应用样式
          </Button>
        </>
      )}
      <Button variant="ghost" type="button" className="text-destructive" onClick={remove}>
        <Trash2 className="size-4" />
        删除所选注解
      </Button>
    </form>
  )
}
export function AnnotationStyleControls() {
  const selection = useAnnotationInteraction((state) => state.selected)
  const sheetId = useEditor((state) => state.activeSheetId)
  if (selection?.sheetId !== sheetId) return null
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="所选注解样式" title="所选注解样式">
          <Paintbrush className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={12}
          className="z-50 w-56 rounded-xl border bg-popover p-3 shadow-lg"
          aria-label="所选注解样式"
        >
          <AnnotationStyleForm
            key={`${selection.kind}:${selection.id}`}
            id={selection.id}
            kind={selection.kind}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
