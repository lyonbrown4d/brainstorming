import { useMessages } from '@renderer/i18n/useMessages'

import { useMemo } from 'react'
import { useEditor } from '@renderer/state/editor'
import { deleteSelectedTopics, moveSelectedTopics, useSelectedIds } from '@renderer/state/selection'
import { Button } from '@renderer/components/ui/button'
import { FieldSelect } from '@renderer/components/FieldSelect'

export const SelectionToolbar = () => {
  const { translate } = useMessages()

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
      .map((topic) => ({ value: topic.id, label: topic.title || translate('untitledTopic') }))
  }, [document, ids, translate])
  if (ids.length < 2) return null
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-x border-border px-2"
      role="group"
      aria-label={translate('selectedTopicActions')}
    >
      <span className="px-2 text-sm whitespace-nowrap">
        {translate('selectedTopicCount', { count: ids.length })}
      </span>
      {targets.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{translate('moveTo')}</span>
          <FieldSelect
            label={translate('moveSelectedTopicsTo')}
            value=""
            options={targets}
            onChange={moveSelectedTopics}
            className="w-36"
          />
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={deleteSelectedTopics}>
        {translate('deleteSelectedTopics')}
      </Button>
    </div>
  )
}
