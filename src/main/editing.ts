import type { IPCRegistry, TrustedWindow } from '@main/application/ipcRegistry'
import type { SystemEditing } from '@main/system/editing'

export const registerEditingIPC = (
  ipc: IPCRegistry,
  trusted: TrustedWindow,
  editing: SystemEditing,
): void => {
  ipc.handle('clipboard:write-topics', (event, contents: unknown, plainText: unknown) => {
    trusted(event)
    return editing.writeTopics(contents, plainText)
  })
  ipc.handle('clipboard:read-topics', (event) => {
    trusted(event)
    return editing.readTopics()
  })
  ipc.handle('file:export', (event, input: unknown) => editing.exportFile(trusted(event), input))
  ipc.handle('system:open-external', (event, input: unknown) => {
    trusted(event)
    return editing.openExternal(input)
  })
}
