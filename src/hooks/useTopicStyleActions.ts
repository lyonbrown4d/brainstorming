import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, useSelectedIds } from '@renderer/state/selection'
import {
  applyTopicStyle,
  copyTopicStyle,
  topicStyleTargets,
  useCopiedTopicStyle,
} from '@renderer/state/topicStyleActions'

/** Shared actions keep the properties panel and canvas menu on the same command path. */
export const useTopicStyleActions = () => {
  const { translate } = useMessages()
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const busy = useEditor((state) => state.busy)
  const copied = useCopiedTopicStyle((state) => state.style !== null)
  useSelectedIds()
  const selectionCount = selectedTopicIds(useEditor.getState()).length
  const levelCount = topicStyleTargets(document, selectedId, 'level').length
  const descendantCount = topicStyleTargets(document, selectedId, 'descendants').length
  const missing = !document.topics[selectedId]
  return [
    { label: translate('copyTopicStyle'), disabled: busy || missing, run: copyTopicStyle },
    {
      label: translate('pasteStyleToCount', { count: selectionCount }),
      disabled: busy || !copied || !selectionCount,
      run: () => {
        applyTopicStyle('selection')
      },
    },
    {
      label: translate('applyStyleToLevel', { count: levelCount }),
      disabled: busy || missing || !levelCount,
      run: () => {
        applyTopicStyle('level')
      },
    },
    {
      label: translate('applyStyleToDescendants', { count: descendantCount }),
      disabled: busy || missing || !descendantCount,
      run: () => {
        applyTopicStyle('descendants')
      },
    },
  ]
}
