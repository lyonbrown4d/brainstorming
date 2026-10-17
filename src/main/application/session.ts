import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

/** Native window/session state is separate from document persistence and undo history. */
export class WindowSession {
  window: BrowserWindow | null = null
  dirty = false
  preserveRecovery = true
  quitting = false

  getWindow = (): BrowserWindow | null => this.window
  trusted = (event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow => {
    const window = this.window
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('不受信任的请求')
    return window
  }
  setDirty = (dirty: boolean, preserveRecovery: boolean): void => {
    this.dirty = dirty
    this.preserveRecovery = preserveRecovery
    this.window?.setDocumentEdited(dirty)
    this.window?.setTitle(`${dirty ? '● ' : ''}Brainstorming`)
  }
}
