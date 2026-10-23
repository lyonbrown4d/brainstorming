import { commands } from '@renderer/generated/native'
import type { DesktopWindowsAPI, TransferredDocument } from '@shared/windows'

export const createWindowAPI = (
  request: <T>(method: string, args?: Record<string, unknown>) => Promise<T>,
  on: <T>(
    event: string,
    callback: (payload: T) => void,
    valid: (payload: unknown) => payload is T,
  ) => () => void,
): DesktopWindowsAPI => ({
  newWindow: () => request('newWindow'),
  openDocumentInNewWindow: () => request('openDocumentInNewWindow'),
  listWindows: () => request('listWindows'),
  focusWindow: async (windowId) => {
    await commands.focusEditorWindow(windowId)
  },
  moveDocument: (session, targetWindowId) =>
    request('moveDocumentToWindow', {
      session: JSON.parse(session) as unknown,
      ...(targetWindowId === undefined ? {} : { targetWindowId }),
    }),
  takeTransferredDocument: async () => {
    const transfer = await request<{ token: string; session: unknown } | null>(
      'takeTransferredDocument',
    )
    return transfer
      ? ({
          token: transfer.token,
          session: JSON.stringify(transfer.session),
        } satisfies TransferredDocument)
      : null
  },
  acknowledgeTransfer: (token) => request('acknowledgeDocumentTransfer', { token }),
  onDocumentTransfer: (callback) =>
    on('document-transfer', callback, (value): value is unknown => value !== undefined),
  onFocusDocument: (callback) =>
    on('focus-document', callback, (value): value is string => typeof value === 'string'),
  syncMenuState: (state) => request('syncMenuState', { ...state }),
})
