import { useMemo } from 'react'
import { useEditor } from '../state/editor'
import { deleteSelectedTopics, moveSelectedTopics, useSelectedIds } from '../state/selection'
import { Button } from './ui/button'
import { FieldSelect } from './FieldSelect'

export function SelectionToolbar() {
  const document = useEditor((state) => state.history.document)
  const selectedIds = useSelectedIds()
  const ids = useMemo(
    () => selectedIds.filter((id) => document.topics[id]),
    [document, selectedIds],
  )
  const targets = useMemo(() => {
    const blocked = new Set<string>()
    const stack = [...ids]
    while (stack.length) {
      const id = stack.pop()
      if (!id || blocked.has(id)) continue
      blocked.add(id)
      stack.push(...(document.topics[id]?.children ?? []))
    }
    return Object.values(document.topics)
      .filter((topic) => !blocked.has(topic.id))
      .map((topic) => ({ value: topic.id, label: topic.title || '未命名主题' }))
  }, [document, ids])
  if (ids.length < 2) return null
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-x border-border px-2"
      role="group"
      aria-label="多选主题操作"
    >
      <span className="px-2 text-sm whitespace-nowrap">已选择 {ids.length} 个主题</span>
      {targets.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>移动到</span>
          <FieldSelect
            label="移动所选主题到"
            value=""
            options={targets}
            onChange={moveSelectedTopics}
            className="w-36"
          />
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={deleteSelectedTopics}>
        删除所选主题
      </Button>
    </div>
  )
}
