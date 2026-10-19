import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { Network } from 'lucide-react'
import { Popover } from 'radix-ui'
import type { LayoutKind } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, useSelectedIds } from '@renderer/state/selection'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { Button } from '@renderer/components/ui/button'
import { StructureBrowser } from '@renderer/components/documents/StructureBrowser'

export const StructurePicker = ({ inline = false }: { inline?: boolean }) => {
  const { translate } = useMessages()

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
  const content = (
    <>
      <h2 className="text-sm font-semibold">{translate('structure')}</h2>
      <div
        className="my-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        role="group"
        aria-label={translate('structureScope')}
      >
        <Button
          variant={scope === 'sheet' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={scope === 'sheet'}
          onClick={() => {
            setScope('sheet')
          }}
        >
          {translate('currentSheet')}
        </Button>
        <Button
          variant={scope === 'branch' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={scope === 'branch'}
          onClick={() => {
            setScope('branch')
          }}
        >
          {translate('selectedBranch')}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground" role="status">
        {scope === 'sheet'
          ? translate('applyToTheCurrentSheetPreservingOther')
          : translate('applyToValue0SelectedTopicsAndTheir', {
              value0: ids.length,
              value1: mixed ? translate('theSelectionContainsDifferentStructures') : '',
            })}
      </p>
      <StructureBrowser
        key={scope}
        {...(!mixed && current ? { value: current } : {})}
        onChange={apply}
        compact={inline}
        action="apply"
      />
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
          {translate('inheritParentStructure')}
        </Button>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {translate('eachSelectionCanBeUndoneUseTab')}
      </p>
    </>
  )
  if (inline)
    return (
      <section className="py-1" aria-label={translate('structure')}>
        {content}
      </section>
    )
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Network className="size-4" />
          {translate('structure')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          aria-label={translate('structure')}
          className="z-50 max-h-[75vh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg"
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
