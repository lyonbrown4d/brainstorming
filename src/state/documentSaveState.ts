import type { EditorState } from '@renderer/state/editorTypes'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'

export interface DocumentSaveTarget {
  readonly tabId: string
  readonly workbookId: string
  readonly path: string
}
export const savedDocumentEditor = (target: DocumentSaveTarget): EditorState | undefined => {
  const { tabs, activeId } = useDocumentTabs.getState()
  const tab = tabs.find((entry) => entry.id === target.tabId)
  const editor = tab?.id === activeId ? useEditor.getState() : tab?.editor
  return editor?.workbook.id === target.workbookId && editor.path === target.path
    ? editor
    : undefined
}

/** Never recreate a closed tab or apply another tab's persisted baseline to the editor. */
export const updateDocumentSaveState = (
  target: DocumentSaveTarget,
  update: Partial<Pick<EditorState, 'baseline' | 'error'>>,
): void => {
  if (!savedDocumentEditor(target)) return
  if (useDocumentTabs.getState().activeId === target.tabId) useEditor.setState(update)
  else
    useDocumentTabs.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === target.tabId ? { ...tab, editor: { ...tab.editor, ...update } } : tab,
      ),
    }))
}
