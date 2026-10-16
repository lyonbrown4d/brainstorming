import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEffect } from 'react'
import { useEditor } from '../state/editor'
import { useSelectedIds } from '../state/selection'
import { SelectionMarkers } from './workbench/SelectionMarkers'
import { useSpatialView } from '../state/spatial'
import { TopicRichTitle } from './metadata/TopicRichTitle'
import { Button } from './ui/button'
import { TopicFormatting } from './TopicFormatting'
import { TopicContentPanel } from './TopicContentPanel'
import { TopicMetadataPanel } from './metadata/TopicMetadataPanel'
import { FieldSelect } from './FieldSelect'

export function Inspector() {
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
    <aside
      className="flex min-h-0 w-[256px] shrink-0 basis-[256px] flex-col border-l border-border bg-background p-0 text-sm"
      aria-label="主题面板"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 [&_h2]:text-sm [&_h2]:font-semibold">
        <h2>{multiple ? `已选 ${selectedIds.length} 个主题` : spatial ? '主题属性' : '样式'}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={spatial ? '关闭主题面板' : '关闭样式面板'}
          onClick={() => {
            useEditor.setState({ inspectorOpen: false })
          }}
        >
          <ChevronRight size={19} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-5">
        {multiple ? (
          <p className="pt-4 text-xs leading-relaxed text-muted-foreground">
            样式和标记将应用到全部所选主题。
          </p>
        ) : (
          <div className="flex justify-between pt-4 text-xs text-muted-foreground">
            <span>{root ? '中心主题' : firstLevel ? '一级分支' : '子主题'}</span>
            <span>{topic.children.length} 个子主题</span>
          </div>
        )}
        <TopicFormatting />
        <SelectionMarkers ids={selectedIds} />
        {!multiple && (
          <>
            <section className="border-t border-border py-4">
              <TopicRichTitle key={`title:${selectedId}`} topicId={selectedId} />
            </section>
            <TopicContentPanel key={selectedId} topicId={selectedId} />
            <TopicMetadataPanel key={`metadata:${selectedId}`} topicId={selectedId} />
          </>
        )}
        {!multiple && !root && (
          <section className="format-group border-t border-border py-[18px] [&_h3]:mb-2.5 [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-secondary-foreground position-group pb-0">
            <h3>分支位置</h3>
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
                  左侧
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
                  右侧
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
                上移
              </Button>
              <Button
                variant="ghost"
                disabled={index >= (parent?.children.length ?? 0) - 1}
                onClick={() => {
                  reorder(1)
                }}
              >
                <ArrowDown size={14} />
                下移
              </Button>
            </div>
            <div className="move-parent-field mt-3 flex flex-col gap-[9px] text-xs text-secondary-foreground [&_.field-select]:w-full">
              <span>移动到主题</span>
              <FieldSelect
                label="移动到父主题"
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
              删除分支
            </Button>
          </section>
        )}
      </div>
    </aside>
  )
}
