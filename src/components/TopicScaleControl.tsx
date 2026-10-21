import { useRef, useState } from 'react'
import type { Topic } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export const TopicScaleControl = ({ topic }: { topic: Topic }) => {
  const { translate } = useMessages()
  const [draft, setDraft] = useState<string | null>(null)
  const suppressBlur = useRef(false)
  const currentScale = topic.style?.scale ?? 1
  const commit = (scale: number): void => {
    useEditor.getState().commitDraft()
    const editor = useEditor.getState()
    if (editor.busy || editor.editingId) return
    const current = editor.history.document.topics[topic.id]
    if (!current || (current.style?.scale ?? 1) === scale) return
    const style = { ...current.style }
    delete style.scale
    editor.command({
      type: 'setTopicStyle',
      topicId: topic.id,
      style: scale === 1 ? style : { ...style, scale },
    })
  }
  const commitDraft = (): void => {
    if (draft === null) return
    setDraft(null)
    const percentage = Number(draft)
    if (draft.trim() && Number.isFinite(percentage) && percentage >= 50 && percentage <= 300)
      commit(Math.round(percentage) / 100)
  }
  return (
    <div className="format-field mt-3 flex flex-col gap-2 text-[11px] text-muted-foreground">
      <span>{translate('topicScale')}</span>
      <div className="flex items-center gap-2">
        <Input
          aria-label={translate('topicScale')}
          className="h-8 flex-1 bg-background px-2"
          type="number"
          min={50}
          max={300}
          step={1}
          value={draft ?? String(Math.round(currentScale * 100))}
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
        <span aria-hidden>%</span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={currentScale === 1}
          onPointerDown={() => {
            suppressBlur.current = true
          }}
          onClick={() => {
            setDraft(null)
            commit(1)
            suppressBlur.current = false
          }}
        >
          {translate('resetTopicScale')}
        </Button>
      </div>
    </div>
  )
}
