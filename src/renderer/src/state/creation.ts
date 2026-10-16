import { applyCommand, createDocument, validateDocument, type MindMapDocument } from '@core'
import type { CreationRequest } from '../components/creation/CreationGallery'
import { createTemplate } from '../components/documents/templates'
import { confirmDiscard } from './documentDiscard'
import { addDocumentSheet, useEditor } from './editor'
import { exampleWorkbook } from './example'
import { resetBrowserPassword } from './password'
import { useSearch } from './searchState'
import { enterWorkspaceEditor, useWorkspace } from './workspace'

function commitReady(): boolean {
  if (useEditor.getState().busy) return false
  useEditor.getState().commitDraft()
  return !useEditor.getState().editingId
}

export function beginCreation(mode: 'document' | 'sheet'): boolean {
  if (!commitReady()) return false
  const workspace = useWorkspace.getState()
  if (mode === 'sheet' && !workspace.hasDocument) return false
  useSearch.setState({ open: false })
  useEditor.getState().setError(null)
  useWorkspace.setState({
    screen: mode === 'document' ? 'create-document' : 'create-sheet',
    returnScreen: workspace.hasDocument ? 'editor' : 'home',
    creationWorkbookId: mode === 'sheet' ? useEditor.getState().workbook.id : null,
  })
  return true
}

export function cancelCreation(): void {
  const { screen, returnScreen } = useWorkspace.getState()
  if (useEditor.getState().busy || !['create-document', 'create-sheet'].includes(screen)) return
  useWorkspace.setState({ screen: returnScreen, creationWorkbookId: null })
  useEditor.getState().setError(null)
}

export function showWorkspaceHome(): boolean {
  if (!commitReady()) return false
  useSearch.setState({ open: false })
  useWorkspace.setState({ screen: 'home', creationWorkbookId: null })
  useEditor.getState().setError(null)
  return true
}

function initialDocument(request: CreationRequest, sheet: boolean): MindMapDocument {
  const base =
    request.template === 'blank'
      ? createDocument(sheet ? '新画布' : '新的想法', crypto.randomUUID())
      : createTemplate(request.template)
  const title = request.title.trim() || base.title
  if (title.length > 80) throw new Error('名称不能超过 80 个字符')
  const named = applyCommand(base, { type: 'renameTopic', topicId: base.rootId, title })
  const document = applyCommand(named, {
    type: 'setDocumentSettings',
    settings: { ...named.settings, layout: request.layout },
  })
  validateDocument(document)
  return document
}

export function createFromRequest(request: CreationRequest): boolean {
  const workspace = useWorkspace.getState()
  if (!['create-document', 'create-sheet'].includes(workspace.screen) || !commitReady())
    return false
  const sheet = workspace.screen === 'create-sheet'
  if (
    sheet &&
    (!workspace.hasDocument || workspace.creationWorkbookId !== useEditor.getState().workbook.id)
  ) {
    useEditor.getState().setError('当前工作簿已更改，请重新进入新建画布。')
    return false
  }
  try {
    const document = initialDocument(request, sheet)
    if (sheet) {
      if (!addDocumentSheet(document)) return false
    } else {
      if (workspace.hasDocument && !confirmDiscard()) return false
      resetBrowserPassword()
      useEditor.getState().replace(document, null, true)
    }
    enterWorkspaceEditor()
    return true
  } catch (error) {
    useEditor.getState().setError(error instanceof Error ? error.message : '创建失败，请重试。')
    return false
  }
}

export function exploreExample(): boolean {
  if (!commitReady()) return false
  if (useWorkspace.getState().hasDocument && !confirmDiscard()) return false
  resetBrowserPassword()
  useEditor.getState().replace(exampleWorkbook())
  enterWorkspaceEditor()
  return true
}
