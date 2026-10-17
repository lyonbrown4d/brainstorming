import type { OpenedDocument } from '@shared/contracts'
import { translate } from '@renderer/i18n'
import { deserializeWorkbook } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import { suggestedFileName } from '@renderer/state/fileName'
import {
  activateOpenedDocument,
  cancelOpenedDocument,
  unlockOpenedDocument,
} from '@renderer/state/lockedFiles'
import { beginCreation } from '@renderer/state/creation'
import {
  findDocumentTab,
  openDocumentTab,
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { serializedWorkbook } from '@renderer/state/workbookState'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { invalidateRecentFiles } from '@renderer/hooks/useRecentFiles'
import { useWorkspace } from '@renderer/state/workspace'
import { stopPresentation } from '@renderer/state/presentation'
const showError = (error: unknown): void => {
  useEditor
    .getState()
    .setError(error instanceof Error ? error.message : translate('fileOperationFailedPleaseRetry'))
}
export const newDocument = (): void => {
  beginCreation('document')
}
const acceptFileSelection = async (select: () => Promise<OpenedDocument | null>): Promise<void> => {
  if (useEditor.getState().busy) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  stopPresentation()
  synchronizeDocumentTab()
  let reusedId: string | null = null
  useEditor.setState({ busy: true })
  try {
    const selected = await select()
    if (!selected) return
    const existingPath = findDocumentTab(selected.path)
    if (existingPath) {
      await cancelOpenedDocument(selected)
      reusedId = existingPath.id
      return
    }
    const result = await unlockOpenedDocument(selected)
    if (!result) return
    const document = deserializeWorkbook(result.contents)
    const existingDocument = findDocumentTab(result.path, document.id)
    if (existingDocument) {
      await cancelOpenedDocument(result)
      reusedId = existingDocument.id
      return
    }
    synchronizeDocumentTab(true)
    if (useDocumentTabs.getState().tabs.length >= 32) {
      await cancelOpenedDocument(result)
      throw new Error(translate('maxOpenMaps'))
    }
    await activateOpenedDocument(result)
    synchronizeDocumentTab(true)
    const imported = result.path === null
    openDocumentTab(document, result.path, imported, true)
    void invalidateRecentFiles()
    if (imported)
      useEditor.setState({
        importReport: {
          sourceName: result.sourcePath?.split(/[\\/]/u).at(-1) ?? translate('xmindFile'),
          warnings: result.warnings ?? [],
        },
      })
  } catch (error) {
    showError(error)
  } finally {
    useEditor.setState({ busy: false })
    if (reusedId) switchDocumentTab(reusedId)
  }
}

/** Shared desktop-open acceptance, including password prompts and tab reuse. */
export const acceptOpenedDocument = (selected: OpenedDocument): Promise<void> =>
  acceptFileSelection(() => Promise.resolve(selected))

export const openDocument = async (recentPath?: string, pending = false): Promise<void> => {
  if (useEditor.getState().busy) return
  try {
    const bridge = requireDesktopAPI()
    if (pending && !(await bridge.hasOpenFile())) return
    await acceptFileSelection(() =>
      pending
        ? bridge.takeOpenFile()
        : recentPath
          ? bridge.openRecent(recentPath)
          : bridge.openDocument(),
    )
  } catch (error) {
    showError(error)
  }
}
export const saveDocument = async (saveAs = false): Promise<void> => {
  if (
    useEditor.getState().busy ||
    !useWorkspace.getState().hasDocument ||
    useWorkspace.getState().screen !== 'editor'
  )
    return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  const { workbook, path } = useEditor.getState()
  const contents = serializedWorkbook(workbook)
  useEditor.setState({ busy: true, error: null })
  try {
    const savedPath = await queueDocumentWrite(path, () =>
      requireDesktopAPI().saveDocument({
        path: saveAs ? null : path,
        contents,
        suggestedName: suggestedFileName(workbook.title),
        openDocumentIds: useDocumentTabs.getState().tabs.map((tab) => tab.editor.workbook.id),
      }),
    )
    if (savedPath && useEditor.getState().workbook.id === workbook.id) {
      useEditor.setState({ baseline: contents, path: savedPath })
      void invalidateRecentFiles()
    }
  } catch (error) {
    showError(error)
  } finally {
    useEditor.setState({ busy: false })
  }
}
export {
  restoreRecovery,
  readRecoveryContents,
  retryRecovery,
  restoreBackup,
  changeFilePassword,
} from '@renderer/state/fileSecurityActions'
