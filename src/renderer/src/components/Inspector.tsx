import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEditor } from '../state/editor'
import { TopicEditor } from './TopicEditor'
import { Button } from './ui/button'
import { TopicFormatting } from './TopicFormatting'
import { TopicContentPanel } from './TopicContentPanel'
import { FieldSelect } from './FieldSelect'

export function Inspector() {
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
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
      className="inspector style-inspector flex min-h-0 w-[264px] shrink-0 basis-[264px] flex-col border-l border-border bg-secondary/30 p-0"
      aria-label="主题面板"
    >
      <div className="style-panel-heading flex items-center justify-between px-[18px] pt-5 pb-4 [&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-semibold">
        <h2>样式</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭样式面板"
          onClick={() => {
            useEditor.setState({ inspectorOpen: false })
          }}
        >
          <ChevronRight size={19} />
        </Button>
      </div>
      <div className="style-panel-content overflow-auto px-[18px] pb-5">
        <div className="inspector-selection mb-5 flex justify-between text-[11px] text-muted-foreground">
          <span>{root ? '中心主题' : firstLevel ? '一级分支' : '子主题'}</span>
          <span>{topic.children.length} 个子主题</span>
        </div>
        <label
          className="topic-name-field flex flex-col gap-[9px] text-xs text-secondary-foreground"
          htmlFor={`topic-inspector-${selectedId}`}
        >
          主题名称
          <TopicEditor key={selectedId} id={selectedId} title={topic.title} surface="inspector" />
        </label>
        <TopicContentPanel key={selectedId} topicId={selectedId} />
        <TopicFormatting />
        {!root && (
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
