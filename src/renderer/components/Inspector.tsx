import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownRight,
  PenLine,
  Plus,
  Trash2,
} from 'lucide-react'
import { getParentId } from '@/core'
import { useEditor } from '../state/editor'
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
      run(() => {
        useEditor
          .getState()
          .command({ type: 'moveTopic', topicId: selectedId, parentId, index: index + offset })
      })
  }
  return (
    <aside className="inspector" aria-label="主题面板">
      <div className="inspector-eyebrow">TOPIC / 主题</div>
      <h2>{topic.title}</h2>
      <p className="muted">
        {root ? '中心主题' : firstLevel ? '一级分支' : '子主题'} <span>·</span>{' '}
        {topic.children.length} 个子主题
      </p>
      <button
        className="inspector-edit"
        onClick={() => {
          useEditor.getState().startEdit(selectedId)
        }}
      >
        <PenLine size={14} /> 编辑标题 <kbd>F2</kbd>
      </button>
      <div className="inspector-divider" />
      <h3>让想法继续生长</h3>
      <button
        className="inspector-action"
        onClick={() => {
          useEditor.getState().add('child')
        }}
      >
        <CornerDownRight size={16} /> 添加子主题 <kbd>Tab</kbd>
      </button>
      <button
        className="inspector-action"
        onClick={() => {
          useEditor.getState().add('sibling')
        }}
      >
        <Plus size={16} /> 添加同级主题 <kbd>Enter</kbd>
      </button>
      {!root && (
        <>
          <div className="inspector-divider" />
          <h3>分支位置</h3>
          {firstLevel && (
            <div className="segmented">
              <button
                className={topic.side === 'left' ? 'active' : ''}
                onClick={() => {
                  run(() => {
                    useEditor
                      .getState()
                      .command({ type: 'setSide', topicId: selectedId, side: 'left' })
                  })
                }}
              >
                <ArrowLeft size={13} /> 左侧
              </button>
              <button
                className={topic.side === 'right' ? 'active' : ''}
                onClick={() => {
                  run(() => {
                    useEditor
                      .getState()
                      .command({ type: 'setSide', topicId: selectedId, side: 'right' })
                  })
                }}
              >
                <ArrowRight size={13} /> 右侧
              </button>
            </div>
          )}
          <div className="inspector-row">
            <button
              disabled={index <= 0}
              onClick={() => {
                reorder(-1)
              }}
            >
              <ArrowUp size={14} /> 上移
            </button>
            <button
              disabled={index >= (parent?.children.length ?? 0) - 1}
              onClick={() => {
                reorder(1)
              }}
            >
              <ArrowDown size={14} /> 下移
            </button>
          </div>
          <label className="parent-label">
            移动到主题
            <select
              aria-label="移动到父主题"
              value={parentId}
              onChange={(event) => {
                run(() => {
                  useEditor.getState().command({
                    type: 'moveTopic',
                    topicId: selectedId,
                    parentId: event.target.value,
                  })
                })
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
          <button
            className="delete-action"
            onClick={() => {
              useEditor.getState().remove()
            }}
          >
            <Trash2 size={14} /> 删除分支
          </button>
        </>
      )}
      <div className="keyboard-card">
        <span>小提示</span>
        <p>
          双击主题编辑，直接输入也可以。
          <br />
          拖动分支到另一个主题附近，整理你的想法。
        </p>
        <div>
          <kbd>⌘ Z</kbd> 撤销 <kbd>↑ ↓ ← →</kbd> 导航
        </div>
      </div>
    </aside>
  )
}
