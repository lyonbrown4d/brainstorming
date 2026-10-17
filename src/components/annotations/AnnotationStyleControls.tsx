import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { Popover } from 'radix-ui'
import { Paintbrush, Trash2 } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'

const AnnotationStyleForm = ({
  id,
  kind,
}: {
  id: string
  kind: 'relation' | 'group' | 'callout'
}) => {
  const { translate } = useMessages()

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
          <span className="text-xs">{translate('annotationColor')}</span>
          <Input
            type="color"
            aria-label={translate('annotationColor')}
            value={color}
            onChange={(event) => {
              setColor(event.target.value)
            }}
          />
          {kind === 'relation' && (
            <>
              <FieldSelect
                label={translate('relationshipArrows')}
                value={arrow}
                options={[
                  { value: 'none', label: translate('noArrows') },
                  { value: 'end', label: translate('oneDirection') },
                  { value: 'both', label: translate('bothDirections') },
                ]}
                onChange={setArrow}
              />
              <FieldSelect
                label={translate('relationshipWidth')}
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
                {translate('dashed')}
              </Button>
            </>
          )}
          <Button type="submit" size="sm">
            {translate('applyStyle')}
          </Button>
        </>
      )}
      <Button variant="ghost" type="button" className="text-destructive" onClick={remove}>
        <Trash2 className="size-4" />
        {translate('deleteSelectedAnnotation')}
      </Button>
    </form>
  )
}
export const AnnotationStyleControls = ({ inline = false }: { inline?: boolean }) => {
  const { translate } = useMessages()

  const selection = useAnnotationInteraction((state) => state.selected)
  const sheetId = useEditor((state) => state.activeSheetId)
  if (selection?.sheetId !== sheetId) return null
  const form = (
    <AnnotationStyleForm
      key={`${selection.kind}:${selection.id}`}
      id={selection.id}
      kind={selection.kind}
    />
  )
  if (inline)
    return (
      <section className="space-y-3 py-4" aria-label={translate('selectedAnnotationStyle')}>
        <h3 className="text-sm font-medium">{translate('selectedAnnotationStyle')}</h3>
        {form}
      </section>
    )
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={translate('selectedAnnotationStyle')}
          title={translate('selectedAnnotationStyle')}
        >
          <Paintbrush className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          className="z-50 w-56 rounded-xl border bg-popover p-3 shadow-lg"
          aria-label={translate('selectedAnnotationStyle')}
        >
          {form}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
