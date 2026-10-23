import { z } from 'zod'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import {
  captureDocumentSession,
  restoreDocumentSession,
  type DocumentSession,
} from '@renderer/state/documentSession'
import {
  detachDocumentTab,
  findDocumentTab,
  runDocumentTabTransition,
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { detachNativeEditor, flushNativeEditor } from '@renderer/state/nativeEditorQueue'
import {
  captureNativeSheetHistory,
  restoreNativeSheetHistory,
} from '@renderer/state/nativeSheetHistory'
import { useWorkspace, enterWorkspaceEditor } from '@renderer/state/workspace'
import { stopPresentation } from '@renderer/state/presentation'
import { getSpatialViewport, setSpatialViewport } from '@renderer/state/spatialViewports'
import { setSpatialLens, spatialLensKey, useSpatialLens } from '@renderer/state/spatialLens'
import type { SheetView } from '@renderer/state/editorTypes'

interface TransferSnapshot extends DocumentSession {
  readonly nativeFocusHistory: unknown
  readonly cameras: readonly { sheetId: string; viewport?: SheetView; distance?: number }[]
}
const report = (error: unknown): void => {
  useEditor.getState().setError(error instanceof Error ? error.message : String(error))
}

export const moveDocumentToWindow = async (
  tabId: string,
  targetWindowId?: string,
): Promise<void> => {
  const windows = requireDesktopAPI().windows
  if (!windows || useEditor.getState().busy) return
  if (!switchDocumentTab(tabId)) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  stopPresentation()
  await flushNativeEditor()
  synchronizeDocumentTab()
  const tab = useDocumentTabs.getState().tabs.find((entry) => entry.id === tabId)
  if (!tab) return
  const session: TransferSnapshot = {
    ...captureDocumentSession(),
    nativeFocusHistory: captureNativeSheetHistory(tab.editor.workbook.id),
    cameras: tab.editor.workbook.sheets.map((sheet) => {
      const viewport = getSpatialViewport(tab.editor.workbook.id, sheet.id, '3d')
      const distance =
        useSpatialLens.getState().distances[spatialLensKey(tab.editor.workbook.id, sheet.id)]
      return {
        sheetId: sheet.id,
        ...(viewport ? { viewport } : {}),
        ...(distance === undefined ? {} : { distance }),
      }
    }),
  }
  useEditor.setState({ busy: true })
  try {
    await windows.moveDocument(JSON.stringify(session), targetWindowId)
    detachNativeEditor(tab.editor.workbook.id)
    detachDocumentTab(tabId)
  } finally {
    useEditor.setState({ busy: false })
  }
}

export const receiveTransferredDocuments = async (): Promise<void> => {
  const windows = requireDesktopAPI().windows
  if (!windows || useEditor.getState().busy || useEditor.getState().editingId) return
  for (;;) {
    const transferred = await windows.takeTransferredDocument()
    if (!transferred) return
    const value: unknown = JSON.parse(transferred.session)
    z.object({
      editor: z.object({ workbook: z.object({ id: z.string() }) }),
      cameras: z.array(
        z.object({
          sheetId: z.string(),
          viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
          distance: z.number().positive().optional(),
        }),
      ),
    }).parse(value)
    const snapshot = value as TransferSnapshot
    await flushNativeEditor()
    synchronizeDocumentTab()
    const previousSession = captureDocumentSession()
    const previousTabs = useDocumentTabs.getState()
    const previousWorkspace = useWorkspace.getState()
    try {
      runDocumentTabTransition(() => {
        const existing = findDocumentTab(null, snapshot.editor.workbook.id)
        if (existing) switchDocumentTab(existing.id)
        else {
          const session = {
            ...snapshot,
            editor: { ...useEditor.getState(), ...snapshot.editor },
          }
          const id = crypto.randomUUID()
          useDocumentTabs.setState((state) => ({
            tabs: [...state.tabs, { ...session, id }],
            activeId: id,
          }))
          restoreDocumentSession(session)
          enterWorkspaceEditor()
          restoreNativeSheetHistory(snapshot.editor.workbook.id, snapshot.nativeFocusHistory)
          for (const camera of snapshot.cameras) {
            if (camera.viewport)
              setSpatialViewport(snapshot.editor.workbook.id, camera.sheetId, '3d', camera.viewport)
            setSpatialLens(snapshot.editor.workbook.id, camera.sheetId, camera.distance)
          }
        }
        useEditor.setState({ busy: true })
      })
      await windows.acknowledgeTransfer(transferred.token)
      useEditor.setState({ busy: false })
    } catch (error) {
      runDocumentTabTransition(() => {
        useDocumentTabs.setState(previousTabs)
        restoreDocumentSession(previousSession)
        useWorkspace.setState(previousWorkspace)
      })
      // Publish the complete rollback to lifecycle subscribers, including an empty workspace.
      useDocumentTabs.setState({ tabs: [...previousTabs.tabs] })
      throw error
    }
    synchronizeDocumentTab()
  }
}
export const subscribeWindowTransfers = (): (() => void) => {
  const windows = requireDesktopAPI().windows
  if (!windows) return () => undefined
  let receiving: Promise<void> | undefined
  const receive = (): void => {
    receiving ??= receiveTransferredDocuments()
      .catch(report)
      .finally(() => {
        receiving = undefined
      })
  }
  const removeTransfer = windows.onDocumentTransfer(receive)
  const removeFocus = windows.onFocusDocument((workbookId) => {
    const tab = findDocumentTab(null, workbookId)
    if (tab) switchDocumentTab(tab.id)
  })
  const unsubscribe = useEditor.subscribe((state, previous) => {
    if ((!state.busy && previous.busy) || (!state.editingId && previous.editingId)) receive()
  })
  receive()
  return () => {
    removeTransfer()
    removeFocus()
    unsubscribe()
  }
}
