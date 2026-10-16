import { useEffect } from 'react'
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEditor } from '../../state/editor'
import { runAnnotationCommand } from '../annotations/commands'
import { TopicEditor } from '../TopicEditor'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'

function OutlineEditorRow({ id, depth }: { id: string; depth: number }) {
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
        aria-label={`上移大纲 ${topic.title}`}
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
        aria-label={`下移大纲 ${topic.title}`}
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
        aria-label={`添加大纲子主题 ${topic.title}`}
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
        aria-label={`删除大纲 ${topic.title}`}
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
export function OutlineEditor() {
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
          大纲编辑
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>大纲编辑</DialogTitle>
          <DialogDescription>
            直接编辑主题。Enter 添加同级，Tab 添加子主题；中文输入由 Lexical 处理。
          </DialogDescription>
        </DialogHeader>
        <div aria-label="可编辑大纲">
          {rows.map((row) => (
            <OutlineEditorRow key={row.id} {...row} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
