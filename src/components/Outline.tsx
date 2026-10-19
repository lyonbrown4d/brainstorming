import { useMessages } from '@renderer/i18n/useMessages'

import { ChevronDown, ChevronRight, PanelLeftClose } from 'lucide-react'
import { topicAppearance } from '@shared/appearance'
import { useEditor } from '@renderer/state/editor'
import { selectTopic, selectedTopicIds, useTopicSelected } from '@renderer/state/selection'
import { requestTopicFocus } from '@renderer/state/viewport'
import { Button } from '@renderer/components/ui/button'

const OutlineBranch = ({ id, depth }: { id: string; depth: number }) => {
  const { translate } = useMessages()

  const topic = useEditor((state) => state.history.document.topics[id])
  const stroke = useEditor((state) => topicAppearance(state.history.document, id).stroke)
  const selected = useTopicSelected(id)
  if (!topic) return null
  return (
    <li>
      <div
        className="flex min-h-8 items-center gap-1 rounded-md pr-1 text-xs transition-colors hover:bg-muted/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        data-selected={selected}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {topic.children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 text-muted-foreground"
            aria-label={translate('value0OutlineValue1', {
              value0: topic.collapsed ? translate('expand') : translate('collapse'),
              value1: topic.title,
            })}
            onClick={() => {
              useEditor.getState().commitDraft()
              useEditor.getState().command({ type: 'toggleCollapse', topicId: id })
            }}
          >
            {topic.collapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </Button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: stroke }} />
        <Button
          variant="ghost"
          className="h-auto min-h-8 min-w-0 flex-1 justify-start rounded-md px-1.5 py-1 text-left text-xs font-normal hover:bg-transparent aria-pressed:font-medium"
          aria-pressed={selected}
          onClick={(event) => {
            selectTopic(id, event.metaKey || event.ctrlKey || event.shiftKey)
            const current = useEditor.getState()
            if (!current.editingId && selectedTopicIds(current).includes(id)) requestTopicFocus(id)
          }}
          onDoubleClick={() => {
            useEditor.getState().startEdit(id)
          }}
        >
          <span className="truncate">{topic.title}</span>
        </Button>
      </div>
      {!topic.collapsed && topic.children.length > 0 && (
        <ul className="m-0 list-none p-0">
          {topic.children.map((child) => (
            <OutlineBranch key={child} id={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export const Outline = () => {
  const { translate } = useMessages()

  const rootId = useEditor((state) => state.history.document.rootId)
  const floatingIds = useEditor((state) => state.history.document.floatingIds)
  const count = useEditor((state) => Object.keys(state.history.document.topics).length)
  return (
    <aside
      className="outline-panel flex min-h-0 w-[216px] shrink-0 basis-[216px] flex-col border-r border-border/80 bg-background text-sm"
      aria-label={translate('documentOutline')}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-xs font-semibold">{translate('outline')}</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {count} {translate('topics')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={translate('closeOutline')}
          onClick={() => {
            useEditor.setState({ outlineOpen: false })
          }}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
      <ul className="m-0 flex-1 list-none overflow-auto px-2 py-2">
        <OutlineBranch id={rootId} depth={0} />
        {floatingIds?.map((id) => (
          <OutlineBranch key={id} id={id} depth={0} />
        ))}
      </ul>
    </aside>
  )
}
