import { useMemo } from 'react'
import { ChevronDown, ChevronRight, ListTree, X } from 'lucide-react'
import { useEditor } from '../state/editor'
import { Button } from './ui/button'
function OutlineBranch({ id, depth }: { id: string; depth: number }) {
  const topic = useEditor((state) => state.history.document.topics[id])
  const selected = useEditor((state) => state.selectedId === id)
  if (!topic) return null
  return (
    <li>
      <div
        className={`outline-row ${selected ? 'active' : ''}`}
        style={{ paddingLeft: depth * 15 + 8 }}
      >
        {topic.children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-[19px]"
            aria-label={`${topic.collapsed ? '展开' : '折叠'}大纲 ${topic.title}`}
            onClick={() => {
              useEditor.getState().commitDraft()
              useEditor.getState().command({ type: 'toggleCollapse', topicId: id })
            }}
          >
            {topic.collapsed ? (
              <ChevronRight size={13} className="size-[13px]" />
            ) : (
              <ChevronDown size={13} className="size-[13px]" />
            )}
          </Button>
        ) : (
          <span className="outline-dot" />
        )}
        <Button
          variant="ghost"
          className="outline-title px-0 py-0"
          onClick={() => {
            useEditor.getState().select(id)
          }}
          onDoubleClick={() => {
            useEditor.getState().startEdit(id)
          }}
        >
          {topic.title}
        </Button>
      </div>
      {!topic.collapsed && topic.children.length > 0 && (
        <ul>
          {topic.children.map((child) => (
            <OutlineBranch key={child} id={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
export function Outline() {
  const rootId = useEditor((state) => state.history.document.rootId)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <aside className="outline-panel" aria-label="文档大纲">
      <div className="panel-heading">
        <span>
          <ListTree size={16} /> 文档大纲
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-[25px]"
          aria-label="关闭大纲"
          onClick={() => {
            useEditor.setState({ outlineOpen: false })
          }}
        >
          <X size={15} className="size-[15px]" />
        </Button>
      </div>
      <div className="outline-summary">{count} 个主题 · 一个完整的想法</div>
      <ul className="outline-tree">
        <OutlineBranch id={rootId} depth={0} />
      </ul>
    </aside>
  )
}
