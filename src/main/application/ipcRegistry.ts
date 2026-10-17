import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

export type TrustedWindow = (event: IpcMainInvokeEvent | IpcMainEvent) => Electron.BrowserWindow

/** Own every application IPC registration so a teardown cannot leave stale capabilities. */
export class IPCRegistry {
  private readonly handlers = new Set<string>()
  private readonly listeners: { channel: string; listener: Parameters<IpcMain['on']>[1] }[] = []
  constructor(private readonly ipc: IpcMain) {}

  handle = (channel: string, listener: Parameters<IpcMain['handle']>[1]): void => {
    this.ipc.handle(channel, listener)
    this.handlers.add(channel)
  }

  on = (channel: string, listener: Parameters<IpcMain['on']>[1]): void => {
    this.ipc.on(channel, listener)
    this.listeners.push({ channel, listener })
  }

  dispose = (): void => {
    for (const channel of this.handlers) this.ipc.removeHandler(channel)
    for (const { channel, listener } of this.listeners) this.ipc.removeListener(channel, listener)
    this.handlers.clear()
    this.listeners.length = 0
  }
}
