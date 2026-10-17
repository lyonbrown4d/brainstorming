import { useState } from 'react'
import { Network } from 'lucide-react'
import { Popover } from 'radix-ui'
import type { LayoutKind } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, useSelectedIds } from '@renderer/state/selection'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'
import { StructurePreview } from '@renderer/components/documents/StructurePreview'
import { structureOptions } from '@renderer/components/documents/structureOptions'

export const StructurePicker = () => {
  const [scope, setScope] = useState<'sheet' | 'branch'>('sheet')
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const selected = useSelectedIds()
  const ids = selected.length ? selected : [selectedId]
  const current =
    scope === 'sheet'
      ? (document.topics[document.rootId]?.structure ?? document.settings?.layout ?? 'map')
      : document.topics[ids[0] ?? selectedId]?.structure
  const mixed = scope === 'branch' && ids.some((id) => document.topics[id]?.structure !== current)
  const apply = (structure?: LayoutKind): void => {
    const state = useEditor.getState()
    const latest = state.history.document
    runAnnotationCommand(
      scope === 'sheet' && structure
        ? {
            type: 'batch',
            commands: [
              { type: 'setDocumentSettings', settings: { ...latest.settings, layout: structure } },
              { type: 'setTopicStructure', topicId: latest.rootId },
            ],
          }
        : {
            type: 'batch',
            commands: selectedTopicIds(state).map((topicId) => ({
              type: 'setTopicStructure',
              topicId,
              ...(structure ? { structure } : {}),
            })),
          },
    )
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Network className="size-4" />
          图形结构
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          aria-label="图形结构"
          className="z-50 max-h-[75vh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg"
        >
          <h2 className="text-sm font-semibold">图形结构</h2>
          <div
            className="my-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            role="group"
            aria-label="结构应用范围"
          >
            <Button
              variant={scope === 'sheet' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={scope === 'sheet'}
              onClick={() => {
                setScope('sheet')
              }}
            >
              当前画布
            </Button>
            <Button
              variant={scope === 'branch' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={scope === 'branch'}
              onClick={() => {
                setScope('branch')
              }}
            >
              所选分支
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground" role="status">
            {scope === 'sheet'
              ? '应用到当前画布，保留其他分支的独立结构。'
              : `应用到所选 ${ids.length} 个主题及其子分支。${mixed ? '当前选择包含不同结构。' : ''}`}
          </p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="可用图形结构">
            {structureOptions.map(({ value, label }) => (
              <Button
                key={value}
                variant="outline"
                aria-label={`应用${label}`}
                aria-pressed={!mixed && current === value}
                onClick={() => {
                  apply(value)
                }}
                className="h-auto min-w-0 flex-col gap-1 rounded-lg p-2 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                <StructurePreview kind={value} />
                {label}
              </Button>
            ))}
          </div>
          {scope === 'branch' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              aria-pressed={!mixed && !current}
              onClick={() => {
                apply()
              }}
            >
              恢复跟随上级结构
            </Button>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            一次选择可撤销。使用 Tab 切换选项，Enter 或空格应用。
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
