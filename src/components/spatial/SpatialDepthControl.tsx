import { useState } from 'react'
import { Layers } from 'lucide-react'
import { canvasTopicRoots } from '@renderer/lib/canvasGesture'
import { isCompositionKey } from '@renderer/state/keyboard'
import { selectedTopicIds } from '@renderer/state/selection'
import { useEditor } from '@renderer/state/editor'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Slider } from '@renderer/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'

const TopicDepth = ({ topicId, depth }: { topicId: string; depth: number }) => {
  const { translate } = useMessages()
  const [draft, setDraft] = useState<number | null>(null)
  const commit = (value: number): void => {
    setDraft(null)
    const editor = useEditor.getState()
    if (
      editor.busy ||
      editor.editingId ||
      !Number.isFinite(value) ||
      value < -1000000 ||
      value > 1000000
    )
      return
    const ids = selectedTopicIds(editor)
    const roots = canvasTopicRoots(editor.history.document, ids.includes(topicId) ? ids : [topicId])
    const commands = roots.flatMap((id) => {
      const topic = editor.history.document.topics[id]
      return topic && (topic.style?.spatialDepth ?? 0) !== value
        ? [
            {
              type: 'setTopicStyle' as const,
              topicId: id,
              style: { ...topic.style, spatialDepth: value },
            },
          ]
        : []
    })
    if (commands.length) editor.command({ type: 'batch', commands })
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs" htmlFor="spatial-topic-depth">
          {translate('spatialTopicDepth')}
        </label>
        <Input
          id="spatial-topic-depth"
          type="number"
          min={-1000000}
          max={1000000}
          step={10}
          aria-label={translate('spatialDepthValue')}
          className="h-8 w-24 text-xs"
          value={draft ?? depth}
          onChange={(event) => {
            setDraft(Number(event.target.value))
          }}
          onBlur={() => {
            if (draft !== null) commit(draft)
          }}
          onKeyDown={(event) => {
            if (isCompositionKey(event.nativeEvent)) return
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.blur()
            }
          }}
        />
      </div>
      <Slider
        aria-label={translate('spatialTopicDepth')}
        min={Math.max(-1000000, Math.min(-1000, Math.floor(depth / 1000) * 1000 - 1000))}
        max={Math.min(1000000, Math.max(1000, Math.ceil(depth / 1000) * 1000 + 1000))}
        step={10}
        value={[draft ?? depth]}
        onValueChange={([value]) => {
          setDraft(value ?? depth)
        }}
        onValueCommit={([value]) => {
          commit(value ?? depth)
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{translate('spatialDepthHint')}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            commit(0)
          }}
        >
          {translate('spatialResetDepth')}
        </Button>
      </div>
    </div>
  )
}

export const SpatialDepthControl = () => {
  const { translate } = useMessages()
  const { value: spacingValue } = useActiveSpatialSetting((view) => view.spacing)
  const id = useEditor((state) => state.selectedId)
  const topic = useEditor((state) => state.history.document.topics[id])
  const busy = useEditor((state) => state.busy)
  const [spacing, setSpacing] = useState<number | null>(null)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy} className="h-8 gap-1.5 text-xs">
          <Layers className="size-3.5" />
          {translate('spatialDepth')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-5 p-4">
        {topic && <TopicDepth key={id} topicId={id} depth={topic.style?.spatialDepth ?? 0} />}
        <div className="space-y-3 border-t pt-4">
          <div className="flex justify-between text-xs">
            <span>{translate('spatialSpacing')}</span>
            <span className="tabular-nums text-muted-foreground">{spacing ?? spacingValue}</span>
          </div>
          <Slider
            aria-label={translate('spatialSpacing')}
            min={0}
            max={200}
            step={10}
            value={[spacing ?? spacingValue]}
            onValueChange={([value]) => {
              setSpacing(value ?? spacingValue)
            }}
            onValueCommit={([value]) => {
              setSpacing(null)
              saveSpatialView({ spacing: value ?? spacingValue })
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
