import { PropertySection } from '@renderer/components/workbench/PropertySection'
import { useMessages } from '@renderer/i18n/useMessages'

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEffect } from 'react'
import { useEditor } from '@renderer/state/editor'
import { useSelectedIds } from '@renderer/state/selection'
import { SelectionMarkers } from '@renderer/components/workbench/SelectionMarkers'
import { useSpatialView } from '@renderer/state/spatial'
import { TopicRichTitle } from '@renderer/components/metadata/TopicRichTitle'
import { Button } from '@renderer/components/ui/button'
import { TopicFormatting } from '@renderer/components/TopicFormatting'
import { TopicContentPanel } from '@renderer/components/TopicContentPanel'
import { TopicMetadataPanel } from '@renderer/components/metadata/TopicMetadataPanel'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { MarkerAction } from '@renderer/components/metadata/MarkerAction'

export const TopicProperties = () => {
  const { translate } = useMessages()

  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const sheetId = useEditor((state) => state.activeSheetId)
  const spatial = useSpatialView((state) => state.sheets[sheetId]?.mode === '3d')
  const editingId = useEditor((state) => state.editingId)
  const editingSurface = useEditor((state) => state.editingSurface)
  useEffect(() => {
    if (spatial && editingId && editingSurface === 'inspector')
      window.document.getElementById(`topic-inspector-${editingId}`)?.focus({ preventScroll: true })
  }, [spatial, editingId, editingSurface])
  const selection = useSelectedIds()
  const selectedIds = [...new Set(selection.length ? selection : [selectedId])].filter(
    (id) => document.topics[id],
  )
  const multiple = selectedIds.length > 1
  const topic = document.topics[selectedId]
  if (!topic) return null
  const parentId = getParentId(document, selectedId)
  const parent = parentId ? document.topics[parentId] : undefined
  const index = parent?.children.indexOf(selectedId) ?? -1
  const root = selectedId === document.rootId
  const firstLevel = parentId === document.rootId
  const forbidden = new Set<string>()
  const stack = [selectedId]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id) {
      forbidden.add(id)
      stack.push(...(document.topics[id]?.children ?? []))
    }
  }
  const run = (action: () => void): void => {
    useEditor.getState().commitDraft()
    action()
  }
  const reorder = (offset: number): void => {
    if (parentId)
      run(() =>
        useEditor
          .getState()
          .command({ type: 'moveTopic', topicId: selectedId, parentId, index: index + offset }),
      )
  }
  return (
    <>
      {multiple ? (
        <p className="pt-4 text-xs leading-relaxed text-muted-foreground">
          {translate('selected')}
          {selectedIds.length}
          {translate('topicsStylesAndMarkersApplyToAll')}
        </p>
      ) : (
        <div className="flex justify-between pt-4 text-xs text-muted-foreground">
          <span>
            {root
              ? translate('centralTopic')
              : firstLevel
                ? translate('mainBranch')
                : translate('childTopic')}
          </span>
          <span>
            {topic.children.length}
            {translate('childTopics')}
          </span>
        </div>
      )}
      {!multiple && (
        <section className="py-3">
          <TopicRichTitle key={`title:${selectedId}`} topicId={selectedId} />
        </section>
      )}
      <TopicFormatting />
      {multiple ? (
        <SelectionMarkers ids={selectedIds} />
      ) : (
        <PropertySection title={translate('iconsAndTaskMarkers')}>
          <MarkerAction inline />
        </PropertySection>
      )}
      {!multiple && (
        <>
          <PropertySection title={translate('topicContent')} defaultOpen>
            <TopicContentPanel key={selectedId} topicId={selectedId} />
          </PropertySection>
          <PropertySection title={translate('topicMetadata')}>
            <TopicMetadataPanel key={`metadata:${selectedId}`} topicId={selectedId} />
          </PropertySection>
        </>
      )}
      {!multiple && !root && (
        <PropertySection title={translate('branchPosition')}>
          <section className="format-group border-t border-border py-[18px] [&_h3]:mb-2.5 [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-secondary-foreground position-group pb-0">
            <h3>{translate('branchPosition')}</h3>
            {firstLevel && (
              <div className="position-row mb-2 flex gap-2 [&_[data-slot=button]]:h-8 [&_[data-slot=button]]:flex-1 [&_[data-slot=button]]:border [&_[data-slot=button]]:border-border [&_[data-slot=button]]:bg-background [&_[data-slot=button]]:text-xs [&_[data-slot=button][aria-pressed=true]]:bg-accent [&_[data-slot=button][aria-pressed=true]]:text-accent-foreground">
                <Button
                  variant="ghost"
                  aria-pressed={topic.side === 'left'}
                  onClick={() => {
                    run(() =>
                      useEditor
                        .getState()
                        .command({ type: 'setSide', topicId: selectedId, side: 'left' }),
                    )
                  }}
                >
                  <ArrowLeft size={14} />
                  {translate('left')}
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={topic.side === 'right'}
                  onClick={() => {
                    run(() =>
                      useEditor
                        .getState()
                        .command({ type: 'setSide', topicId: selectedId, side: 'right' }),
                    )
                  }}
                >
                  <ArrowRight size={14} />
                  {translate('right')}
                </Button>
              </div>
            )}
            <div className="position-row mb-2 flex gap-2 [&_[data-slot=button]]:h-8 [&_[data-slot=button]]:flex-1 [&_[data-slot=button]]:border [&_[data-slot=button]]:border-border [&_[data-slot=button]]:bg-background [&_[data-slot=button]]:text-xs [&_[data-slot=button][aria-pressed=true]]:bg-accent [&_[data-slot=button][aria-pressed=true]]:text-accent-foreground">
              <Button
                variant="ghost"
                disabled={index <= 0}
                onClick={() => {
                  reorder(-1)
                }}
              >
                <ArrowUp size={14} />
                {translate('moveUp')}
              </Button>
              <Button
                variant="ghost"
                disabled={index >= (parent?.children.length ?? 0) - 1}
                onClick={() => {
                  reorder(1)
                }}
              >
                <ArrowDown size={14} />
                {translate('moveDown')}
              </Button>
            </div>
            <div className="move-parent-field mt-3 flex flex-col gap-[9px] text-xs text-secondary-foreground [&_.field-select]:w-full">
              <span>{translate('moveToTopic')}</span>
              <FieldSelect
                label={translate('moveToParentTopic')}
                value={parentId ?? ''}
                options={Object.values(document.topics)
                  .filter((candidate) => !forbidden.has(candidate.id))
                  .map((candidate) => ({ value: candidate.id, label: candidate.title }))}
                onChange={(value) => {
                  run(() =>
                    useEditor.getState().command({
                      type: 'moveTopic',
                      topicId: selectedId,
                      parentId: value,
                    }),
                  )
                }}
              />
            </div>
            <Button
              variant="ghost"
              className="remove-branch mt-3.5 justify-start px-0 py-2 text-xs text-destructive"
              onClick={() => {
                useEditor.getState().remove()
              }}
            >
              <Trash2 size={14} />
              {translate('deleteBranch')}
            </Button>
          </section>
        </PropertySection>
      )}
    </>
  )
}
