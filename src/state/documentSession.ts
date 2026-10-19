import type { EditorState } from '@renderer/state/editorTypes'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { useFileSecurityState } from '@renderer/state/password'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useSearch } from '@renderer/state/searchState'
import { useTopicFilters } from '@renderer/components/documents/filterTopics'

export interface DocumentSession {
  readonly editor: EditorState
  readonly selection: ReturnType<typeof useSelection.getState>['sheets']
  readonly security: ReturnType<typeof useFileSecurityState.getState>
  readonly filters: ReturnType<typeof useTopicFilters.getState>
}

/** Session references never enter the file protocol or persisted recovery records. */
export const captureDocumentSession = (): DocumentSession => ({
  editor: useEditor.getState(),
  selection: useSelection.getState().sheets,
  security:
    useFileSecurityState.getState().documentId === useEditor.getState().workbook.id
      ? useFileSecurityState.getState()
      : {
          documentId: null,
          encrypted: false,
          lockedRecovery: useFileSecurityState.getState().lockedRecovery,
        },
  filters: useTopicFilters.getState(),
})

export const restoreDocumentSession = (session: DocumentSession): void => {
  useSelection.setState({ sheets: session.selection })
  useFileSecurityState.setState(session.security)
  useTopicFilters.setState(session.filters)
  useAnnotationInteraction.setState({
    fromId: null,
    sheetId: null,
    selected: null,
    editing: false,
    floating: false,
  })
  useSearch.setState({ open: false })
  useEditor.setState({ ...session.editor, busy: false, recovery: null })
}
