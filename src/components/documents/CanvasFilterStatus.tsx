import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasTopicFilter } from '@renderer/hooks/useCanvasTopicFilter'
import { defaultTopicFilters, useTopicFilters } from '@renderer/components/documents/filterTopics'
import { Button } from '@renderer/components/ui/button'
import { useLayoutEffect } from 'react'
import { selectedTopicIds, selectedDrawingIds, setCanvasSelection } from '@renderer/state/selection'

export const CanvasFilterStatus = () => {
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const { matches, visible } = useCanvasTopicFilter(document)
  useLayoutEffect(() => {
    if (!visible) return
    const state = useEditor.getState()
    const selected = selectedTopicIds(state)
    const retained = selected.filter((id) => visible.has(id))
    if (retained.length !== selected.length)
      setCanvasSelection(retained.length ? retained : [document.rootId], selectedDrawingIds(state))
  }, [visible, document.rootId])
  if (!matches) return null
  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <span role="status">
        {matches.size
          ? translate('canvasFilterActive', { count: matches.size })
          : translate('canvasFilterEmpty')}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          useTopicFilters.setState(defaultTopicFilters)
        }}
      >
        {translate('exitCanvasFilter')}
      </Button>
    </div>
  )
}
