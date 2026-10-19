import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { Popover } from 'radix-ui'
import { CirclePlus, CornerDownRight } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { armFloatingTopic, useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'
import { FieldSelect } from '@renderer/components/FieldSelect'

export const FloatingActions = () => {
  const { translate } = useMessages()

  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const armed = useAnnotationInteraction((state) => state.floating)
  const [parentId, setParentId] = useState(document.rootId)
  const floating = document.floatingIds?.includes(selectedId) ?? false
  const forbidden = new Set<string>(),
    stack = [selectedId]
  while (stack.length) {
    const id = stack.pop()
    if (id && !forbidden.has(id)) {
      forbidden.add(id)
      stack.push(...(document.topics[id]?.children ?? []))
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={translate('addFloatingTopic')}
        aria-pressed={armed}
        onClick={() => {
          armFloatingTopic()
        }}
      >
        <CirclePlus className="size-4" />
        {translate('floatingTopic')}
      </Button>
      {floating && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm">
              <CornerDownRight className="size-4" />
              {translate('attachBranch')}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              sideOffset={12}
              className="z-50 w-64 space-y-3 rounded-xl border bg-popover p-3 shadow-lg"
              aria-label={translate('attachBranch')}
            >
              <p className="text-xs">
                {translate('attach')}
                {document.topics[selectedId]?.title}
                {translate('toTopic')}
              </p>
              <FieldSelect
                label={translate('attachToParentTopic')}
                value={parentId}
                options={Object.values(document.topics)
                  .filter((topic) => !forbidden.has(topic.id))
                  .map((topic) => ({
                    value: topic.id,
                    label: topic.title || translate('untitledTopic'),
                  }))}
                onChange={setParentId}
              />
              <Button
                size="sm"
                onClick={() => {
                  runAnnotationCommand({
                    type: 'attachFloatingTopic',
                    topicId: selectedId,
                    parentId,
                  })
                }}
              >
                {translate('attachBranch')}
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  )
}
