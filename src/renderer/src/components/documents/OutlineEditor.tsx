import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect } from 'react'
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEditor } from '@renderer/state/editor'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

const OutlineEditorRow = ({ id, depth }: { id: string; depth: number }) => {
  const { translate } = useMessages()

  const document = useEditor((state) => state.history.document)
  const active = useEditor((state) => state.editingId === id && state.editingSurface === 'outline')
  const topic = document.topics[id]
  useEffect(() => {
    if (active) window.document.getElementById(`topic-outline-${id}`)?.focus()
  }, [active, id])
  if (!topic) return null
  const parentId = getParentId(document, id),
    parent = parentId ? document.topics[parentId] : undefined
  const index = parent?.children.indexOf(id) ?? -1
  const move = (offset: number): void => {
    if (parentId)
      runAnnotationCommand({ type: 'moveTopic', topicId: id, parentId, index: index + offset })
  }
  return (
    <div
      className="flex items-center gap-1 border-b border-border/50 py-1"
      style={{ paddingLeft: Math.min(depth, 12) * 16 }}
    >
      <div className="min-w-0 flex-1">
        <TopicEditor id={id} title={topic.title} surface="outline" />
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={!parent || index === 0}
        aria-label={translate('moveOutlineValue0Up', { value0: topic.title })}
        onClick={() => {
          move(-1)
        }}
      >
        <ArrowUp className="size-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={!parent || index >= parent.children.length - 1}
        aria-label={translate('moveOutlineValue0Down', { value0: topic.title })}
        onClick={() => {
          move(1)
        }}
      >
        <ArrowDown className="size-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={translate('addOutlineChildValue0', { value0: topic.title })}
        onClick={() => {
          const state = useEditor.getState()
          state.select(id)
          state.add('child')
          const next = useEditor.getState().editingId
          if (next) state.startEdit(next, undefined, 'outline')
        }}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={id === document.rootId}
        aria-label={translate('deleteOutlineValue0', { value0: topic.title })}
        onClick={() => {
          const state = useEditor.getState()
          state.select(id)
          state.remove()
        }}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}
export const OutlineEditor = () => {
  const { translate } = useMessages()

  const document = useEditor((state) => state.history.document)
  const rows: { id: string; depth: number }[] = [],
    stack = [document.rootId, ...(document.floatingIds ?? [])]
      .reverse()
      .map((id) => ({ id, depth: 0 }))
  while (stack.length) {
    const item = stack.pop()
    if (!item) break
    rows.push(item)
    const topic = document.topics[item.id]
    stack.push(...(topic?.children ?? []).map((id) => ({ id, depth: item.depth + 1 })).reverse())
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListTree className="size-4" />
          {translate('editOutline')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{translate('editOutline')}</DialogTitle>
          <DialogDescription>{translate('editTopicsDirectlyEnterAddsASibling')}</DialogDescription>
        </DialogHeader>
        <div aria-label={translate('editableOutline')}>
          {rows.map((row) => (
            <OutlineEditorRow key={row.id} {...row} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
