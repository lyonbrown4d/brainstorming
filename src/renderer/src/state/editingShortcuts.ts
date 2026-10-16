import { getVisibleTopicIds } from '@core'
import { useEditor } from './editor'
import { setSelectedTopics } from './selection'
import { copySelectedTopics, duplicateSelectedTopics, pasteSelectedTopics } from './clipboard'
import { useSearch } from './search'

/** Called only outside native text editing and after the composition guard. */
export function handleTopicShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false
  const key = event.key.toLowerCase()
  if (!['a', 'c', 'x', 'v', 'd', 'f'].includes(key)) return false
  event.preventDefault()
  if (key === 'a') setSelectedTopics(getVisibleTopicIds(useEditor.getState().history.document))
  else if (key === 'f') useSearch.setState({ open: true })
  else if (key === 'c' || key === 'x') void copySelectedTopics(key === 'x')
  else if (key === 'v') void pasteSelectedTopics()
  else void duplicateSelectedTopics()
  return true
}
