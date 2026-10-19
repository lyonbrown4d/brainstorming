import { watchCreationTarget } from '@renderer/state/creationTarget'
import { translate } from '@renderer/i18n'
import { applyCommand, createDocument, validateDocument, type MindMapDocument } from '@core'
import type { CreationRequest } from '@renderer/components/creation/CreationGallery'
import { createTemplate } from '@renderer/components/documents/templates'
import { openDocumentTab } from '@renderer/state/documentTabs'
import { addDocumentSheet, useEditor } from '@renderer/state/editor'
import { exampleWorkbook } from '@renderer/state/example'
import { useSearch } from '@renderer/state/searchState'
import {
  emptyCreationDraft,
  enterWorkspaceEditor,
  updateCreationDraft,
  useWorkspace,
} from '@renderer/state/workspace'

const commitReady = (): boolean => {
  if (useEditor.getState().busy) return false
  useEditor.getState().commitDraft()
  return !useEditor.getState().editingId
}

export const beginCreation = (mode: 'document' | 'sheet'): boolean => {
  if (!commitReady()) return false
  const workspace = useWorkspace.getState()
  if (mode === 'sheet' && !workspace.hasDocument) return false
  useSearch.setState({ open: false })
  useEditor.getState().setError(null)
  useWorkspace.setState({
    screen: mode === 'document' ? 'create-document' : 'create-sheet',
    returnScreen: workspace.hasDocument ? 'editor' : 'home',
    creationWorkbookId: mode === 'sheet' ? useEditor.getState().workbook.id : null,
    creationStep: 1,
  })
  return true
}

export const cancelCreation = (): void => {
  const { screen, returnScreen } = useWorkspace.getState()
  if (useEditor.getState().busy || !['create-document', 'create-sheet'].includes(screen)) return
  useWorkspace.setState({ screen: returnScreen, creationWorkbookId: null })
  useEditor.getState().setError(null)
}

export const showWorkspaceHome = (): boolean => {
  if (!commitReady()) return false
  useSearch.setState({ open: false })
  useWorkspace.setState({ screen: 'home', creationWorkbookId: null, creationStep: 1 })
  useEditor.getState().setError(null)
  return true
}

const initialDocument = async (
  request: CreationRequest,
  sheet: boolean,
): Promise<MindMapDocument> => {
  if (request.title.trim().length > 80) throw new Error(translate('nameCannotExceed80Characters'))
  const base =
    request.layout === 'none' || request.template === 'blank'
      ? createDocument(
          sheet ? translate('newSheetLabel402') : translate('newIdea'),
          crypto.randomUUID(),
        )
      : await createTemplate(request.template)
  const title = request.title.trim() || base.title
  if (title.length > 80) throw new Error(translate('nameCannotExceed80Characters'))
  const named = applyCommand(base, { type: 'renameTopic', topicId: base.rootId, title })
  const document = applyCommand(named, {
    type: 'setDocumentSettings',
    settings: { ...named.settings, layout: request.layout === 'none' ? 'map' : request.layout },
  })
  validateDocument(document)
  return document
}

let creating = false
export const createFromRequest = async (request: CreationRequest): Promise<boolean> => {
  const workspace = useWorkspace.getState()
  if (creating || !['create-document', 'create-sheet'].includes(workspace.screen) || !commitReady())
    return false
  const sheet = workspace.screen === 'create-sheet'
  if (
    sheet &&
    (!workspace.hasDocument || workspace.creationWorkbookId !== useEditor.getState().workbook.id)
  ) {
    useEditor.getState().setError(translate('theWorkbookChangedStartCreatingTheSheet'))
    return false
  }
  creating = true
  const target = watchCreationTarget()
  try {
    const document = await initialDocument(request, sheet)
    if (!target.valid() || !commitReady()) return false
    if (sheet) {
      if (!addDocumentSheet(document)) return false
    } else {
      if (!openDocumentTab(document, null, true)) return false
    }
    updateCreationDraft(sheet ? 'sheet' : 'document', emptyCreationDraft())
    enterWorkspaceEditor()
    return true
  } catch (error) {
    if (!target.valid()) return false
    useEditor
      .getState()
      .setError(error instanceof Error ? error.message : translate('creationFailedPleaseRetry'))
    return false
  } finally {
    target.dispose()
    creating = false
  }
}

export const exploreExample = (): boolean => {
  if (!commitReady()) return false
  if (!openDocumentTab(exampleWorkbook())) return false
  enterWorkspaceEditor()
  return true
}
