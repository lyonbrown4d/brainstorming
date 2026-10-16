import { useState } from 'react'
import { Popover } from 'radix-ui'
import { CirclePlus, CornerDownRight } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { useSpatialView } from '../../state/spatial'
import { armFloatingTopic, useAnnotationInteraction } from '../../state/annotationInteraction'
import { runAnnotationCommand } from '../annotations/commands'
import { Button } from '../ui/button'
import { FieldSelect } from '../FieldSelect'

export function FloatingActions() {
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
        aria-label="新增游离主题"
        aria-pressed={armed}
        onClick={() => {
          armFloatingTopic()
          useSpatialView.getState().setMode(useEditor.getState().activeSheetId, '2d')
        }}
      >
        <CirclePlus className="size-4" />
        游离主题
      </Button>
      {floating && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm">
              <CornerDownRight className="size-4" />
              接入分支
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={12}
              className="z-50 w-64 space-y-3 rounded-xl border bg-popover p-3 shadow-lg"
              aria-label="接入分支"
            >
              <p className="text-xs">将「{document.topics[selectedId]?.title}」接入主题：</p>
              <FieldSelect
                label="接入父主题"
                value={parentId}
                options={Object.values(document.topics)
                  .filter((topic) => !forbidden.has(topic.id))
                  .map((topic) => ({ value: topic.id, label: topic.title || '未命名主题' }))}
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
                接入分支
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  )
}
