import { getVisibleTopicIds } from '@core'
import { useEditor } from '@renderer/state/editor'
import { setSelectedTopics } from '@renderer/state/selection'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  pasteSelectedTopics,
} from '@renderer/state/clipboard'
import {
  insertParentTopic,
  removeTopicOnly,
  reorderSelectedTopic,
} from '@renderer/state/structuralEditing'
import { requestViewport } from '@renderer/state/viewport'
import { useSpatialView } from '@renderer/state/spatial'
import { useSearch } from '@renderer/state/search'
import { getNavigationTarget, isCompositionKey } from '@renderer/state/keyboard'

/** Canvas and spatial topic controls share the same structural keyboard actions. */
export const handleTopicNavigation = (event: KeyboardEvent, topicId?: string): boolean => {
  if (isCompositionKey(event)) return false
  if (
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    ['ArrowUp', 'ArrowDown'].includes(event.key)
  ) {
    event.preventDefault()
    reorderSelectedTopic(event.key === 'ArrowUp' ? -1 : 1)
    return true
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (
    !['Tab', 'Enter', 'Delete', 'Backspace', 'F2', ' '].includes(event.key) &&
    !event.key.startsWith('Arrow')
  )
    return false
  if (topicId && useEditor.getState().selectedId !== topicId) useEditor.getState().select(topicId)
  const state = useEditor.getState()
  if (event.key.startsWith('Arrow')) {
    const next = getNavigationTarget(state.history.document, state.selectedId, event.key)
    if (next) state.select(next)
  } else if (event.key === 'Tab' || event.key === 'Enter') {
    state.add(event.key === 'Tab' ? 'child' : 'sibling')
  } else if (event.key === 'Delete' || event.key === 'Backspace') state.remove()
  else if (event.key === 'F2' || event.key === ' ') {
    const title = state.history.document.topics[state.selectedId]?.title
    state.startEdit(
      state.selectedId,
      undefined,
      'canvas',
      event.key === 'F2' || title === '新主题' || title === '游离主题' ? 'all' : 'end',
    )
  } else return false
  event.preventDefault()
  return true
}

/** Called only outside native text editing and after the composition guard. */
export const handleTopicShortcut = (event: KeyboardEvent): boolean => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false
  const key = event.key.toLowerCase()
  if (
    ![
      'a',
      'c',
      'x',
      'v',
      'd',
      'f',
      'enter',
      'backspace',
      'delete',
      '/',
      'r',
      '=',
      '+',
      '-',
      '0',
    ].includes(key)
  )
    return false
  event.preventDefault()
  const state = useEditor.getState()
  if (key === 'enter') insertParentTopic()
  else if (key === 'delete' || key === 'backspace') removeTopicOnly()
  else if (key === '/') {
    if (state.history.document.topics[state.selectedId]?.children.length)
      state.command({ type: 'toggleCollapse', topicId: state.selectedId })
  } else if (key === 'r') {
    state.select(state.history.document.rootId)
    useSpatialView.getState().setFocus(state.activeSheetId, null)
    requestViewport('centerRoot')
  } else if (key === '=' || key === '+') requestViewport('zoomIn')
  else if (key === '-') requestViewport('zoomOut')
  else if (key === '0') requestViewport('actualSize')
  else if (key === 'a') setSelectedTopics(getVisibleTopicIds(useEditor.getState().history.document))
  else if (key === 'f') useSearch.setState({ open: true })
  else if (key === 'c' || key === 'x') void copySelectedTopics(key === 'x')
  else if (key === 'v') void pasteSelectedTopics()
  else void duplicateSelectedTopics()
  return true
}
