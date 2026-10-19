import { requireDesktopAPI } from '@renderer/lib/desktop'
import { showPresentationStep } from '@renderer/state/presentation'
import { addTopic } from '@renderer/state/topicCreation'
import {
  toggleSelectedBranches,
  selectRelatedTopics,
  focusTopicProperty,
} from '@renderer/state/topicShortcutActions'
import { addSelectionGroup, toggleRelationMode } from '@renderer/state/annotationInteraction'
import { toggleInspector } from '@renderer/state/inspectorNavigation'
import { importTopicAssets } from '@renderer/state/assets'
import { translate } from '@renderer/i18n'
import { getVisibleTopicIds } from '@core'
import { useEditor } from '@renderer/state/editor'
import { setCanvasSelection, selectedTopicIds } from '@renderer/state/selection'
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
import { useSearch } from '@renderer/state/search'
import { getNavigationTarget, isCompositionKey, isPrimaryModifier } from '@renderer/state/keyboard'

/** Topic controls share the same structural keyboard actions. */
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
  if (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    toggleInspector()
    return true
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (
    !['Tab', 'Enter', 'Delete', 'Backspace', 'F2', 'F5', ' ', 'Escape'].includes(event.key) &&
    !event.key.startsWith('Arrow')
  )
    return false
  if (
    !topicId &&
    !selectedTopicIds(useEditor.getState()).length &&
    !['Delete', 'Backspace'].includes(event.key)
  )
    return false
  if (topicId && useEditor.getState().selectedId !== topicId) useEditor.getState().select(topicId)
  const state = useEditor.getState()
  if (event.key.startsWith('Arrow')) {
    const next = getNavigationTarget(state.history.document, state.selectedId, event.key)
    if (next) state.select(next)
  } else if (event.key === 'Tab' || event.key === 'Enter') {
    if (event.key === 'Tab' && event.shiftKey) return false
    if (event.key === 'Enter' && event.shiftKey) addTopic('sibling', true)
    else state.add(event.key === 'Tab' ? 'child' : 'sibling')
  } else if (event.key === 'F5') showPresentationStep(0)
  else if (event.key === 'Escape') setCanvasSelection([], [])
  else if (event.key === 'Delete' || event.key === 'Backspace') state.remove()
  else if (event.key === 'F2' || event.key === ' ') {
    const title = state.history.document.topics[state.selectedId]?.title
    state.startEdit(
      state.selectedId,
      undefined,
      'canvas',
      event.key === 'F2' || title === translate('newTopic') || title === translate('floatingTopic')
        ? 'all'
        : 'end',
    )
  } else return false
  event.preventDefault()
  return true
}

/** Called only outside native text editing and after the composition guard. */
export const handleTopicShortcut = (event: KeyboardEvent): boolean => {
  if (isCompositionKey(event) || !isPrimaryModifier(event) || useEditor.getState().busy)
    return false
  const key = event.code === 'Slash' ? '/' : event.key.toLowerCase()
  const mac = requireDesktopAPI().platform === 'macos'
  if (
    key === '/' &&
    ((mac && event.shiftKey && !event.altKey) || (!mac && event.altKey && !event.shiftKey))
  ) {
    event.preventDefault()
    toggleSelectedBranches(true)
    return true
  }
  if (key === 'a' && event.altKey && !event.shiftKey) {
    event.preventDefault()
    selectRelatedTopics('children')
    return true
  }
  if (event.altKey) return false
  if (event.shiftKey && ['n', 'r', 'i', 'b', 'a'].includes(key)) {
    event.preventDefault()
    if (key === 'n') focusTopicProperty('notes')
    else if (key === 'r') toggleRelationMode()
    else if (key === 'i') void importTopicAssets(useEditor.getState().selectedId, 'image')
    else if (key === 'b') addSelectionGroup('boundary')
    else selectRelatedTopics('siblings')
    return true
  }
  if (event.shiftKey && key !== '+') return false
  if (
    ![
      'a',
      'b',
      'c',
      'x',
      'v',
      'd',
      'f',
      'i',
      'k',
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
  if (key === 'b' && mac) return false
  event.preventDefault()
  const state = useEditor.getState()
  if (key === 'enter') insertParentTopic()
  else if (key === 'delete' || key === 'backspace') removeTopicOnly()
  else if (key === '/') toggleSelectedBranches()
  else if (key === 'k') focusTopicProperty('link')
  else if (key === 'i') toggleInspector()
  else if (key === 'b') addSelectionGroup('boundary')
  else if (key === 'r') {
    state.select(state.history.document.rootId)
    requestViewport('centerRoot')
  } else if (key === '=' || key === '+') requestViewport('zoomIn')
  else if (key === '-') requestViewport('zoomOut')
  else if (key === '0') requestViewport('actualSize')
  else if (key === 'a')
    setCanvasSelection(
      getVisibleTopicIds(state.history.document),
      state.history.document.drawings?.map((stroke) => stroke.id) ?? [],
    )
  else if (key === 'f') useSearch.setState({ open: true })
  else if (key === 'c' || key === 'x') void copySelectedTopics(key === 'x')
  else if (key === 'v') void pasteSelectedTopics()
  else duplicateSelectedTopics()
  return true
}
