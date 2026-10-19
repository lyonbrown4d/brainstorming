import { useRef, useState } from 'react'
import type { Topic } from '@core'
import { measureTopic } from '@layout'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export const TopicWidthControl = ({ topic, isRoot }: { topic: Topic; isRoot: boolean }) => {
  const { translate } = useMessages()
  const [draft, setDraft] = useState<string | null>(null)
  const suppressBlur = useRef(false)
  const autoWidth = measureTopic(topic.title, isRoot, topic.style?.fontSize, topic).width
  const width = topic.style?.width
  const circleExpanded = topic.style?.shape === 'circle' && width !== undefined && autoWidth > width
  const commit = (next: number | undefined): void => {
    const state = useEditor.getState()
    state.commitDraft()
    const editor = useEditor.getState()
    if (editor.editingId || editor.busy) return
    const current = editor.history.document.topics[topic.id]
    if (!current || current.style?.width === next) return
    const style = { ...current.style }
    delete style.width
    editor.command({
      type: 'setTopicStyle',
      topicId: topic.id,
      style: next === undefined ? style : { ...style, width: next },
    })
  }
  const commitDraft = (): void => {
    if (draft === null) return
    setDraft(null)
    const parsed = Number(draft)
    if (draft.trim() && Number.isFinite(parsed) && parsed >= 80 && parsed <= 1200)
      commit(Math.round(parsed))
  }
  return (
    <div className="format-field flex flex-col gap-2 text-[11px] text-muted-foreground">
      <span>{translate('topicWidth')}</span>
      <div className="flex items-center gap-2">
        <Input
          aria-label={translate('topicWidth')}
          className="h-8 flex-1 bg-background px-2"
          type="number"
          min={80}
          max={1200}
          step={1}
          value={draft ?? String(width ?? Math.round(autoWidth))}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onBlur={() => {
            if (suppressBlur.current) {
              suppressBlur.current = false
              setDraft(null)
            } else commitDraft()
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.stopPropagation()
              suppressBlur.current = true
              setDraft(null)
              event.currentTarget.blur()
            }
          }}
        />
        <span aria-hidden>px</span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={width === undefined}
          onPointerDown={() => {
            suppressBlur.current = true
          }}
          onClick={() => {
            setDraft(null)
            commit(undefined)
            suppressBlur.current = false
          }}
        >
          {translate('fitTopicWidth')}
        </Button>
      </div>
      {circleExpanded && <span role="note">{translate('circleWidthHint')}</span>}
    </div>
  )
}
