import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Trash2 } from 'lucide-react'
import { getParentId } from '@core'
import { useEditor } from '../state/editor'
import { TopicEditor } from './TopicEditor'
import { Button } from './ui/button'
import { TopicFormatting } from './TopicFormatting'

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
    <aside className="inspector style-inspector" aria-label="主题面板">
      <div className="style-panel-heading">
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
      <div className="style-panel-content">
        <div className="inspector-selection">
          <span>{root ? '中心主题' : firstLevel ? '一级分支' : '子主题'}</span>
          <span>{topic.children.length} 个子主题</span>
        </div>
        <label className="topic-name-field" htmlFor={`topic-inspector-${selectedId}`}>
          主题名称
          <TopicEditor key={selectedId} id={selectedId} title={topic.title} surface="inspector" />
        </label>
        <TopicFormatting />
        {!root && (
          <section className="format-group position-group">
            <h3>分支位置</h3>
            {firstLevel && (
              <div className="position-row">
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
            <div className="position-row">
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
            <label className="move-parent-field">
              移动到主题
              <select
                aria-label="移动到父主题"
                value={parentId ?? ''}
                onChange={(event) => {
                  run(() =>
                    useEditor.getState().command({
                      type: 'moveTopic',
                      topicId: selectedId,
                      parentId: event.target.value,
                    }),
                  )
                }}
              >
                {Object.values(document.topics)
                  .filter((candidate) => !forbidden.has(candidate.id))
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="ghost"
              className="remove-branch"
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
