import type { NativeMenu } from '@main/application/nativeMenu'
import { isAppLanguage } from '@shared/language'
import type { dialog } from 'electron'
import type { IPCRegistry } from '@main/application/ipcRegistry'
import type { WindowSession } from '@main/application/session'
import type { DocumentFiles } from '@main/files'
import type { OpenFileRequests } from '@main/openFiles'
import type { AssetFiles } from '@main/system/assets'
import type { SystemEditing } from '@main/system/editing'
import type { AIService } from '@main/ai/application'
import type { MCPService } from '@main/mcp/application'
import { registerIPC } from '@main/ipc'
import { registerAssetIPC } from '@main/assets'
import { registerEditingIPC } from '@main/editing'
import { registerAIIPC } from '@main/ai'
import { registerMCPIPC } from '@main/mcp'

export class ApplicationIPC {
  private registered = false
  constructor(
    private readonly ipc: IPCRegistry,
    private readonly session: WindowSession,
    private readonly files: DocumentFiles,
    private readonly requests: OpenFileRequests,
    private readonly assets: AssetFiles,
    private readonly editing: SystemEditing,
    private readonly ai: AIService,
    private readonly mcp: MCPService,
    private readonly menu: NativeMenu,
    private readonly dialogs: Pick<typeof dialog, 'showOpenDialog' | 'showSaveDialog'>,
  ) {}

  register = (): void => {
    if (this.registered) return
    try {
      this.ipc.handle('app:language:get', (event) => {
        this.session.trusted(event)
        return this.menu.language.get()
      })
      this.ipc.handle('app:language:set', (event, language: unknown) => {
        this.session.trusted(event)
        if (!isAppLanguage(language)) throw new Error('Unsupported application language')
        return this.menu.setLanguage(language)
      })
      registerIPC(this.ipc, this.session, this.files, this.requests, this.dialogs)
      registerAssetIPC(this.ipc, this.session.trusted, this.assets)
      registerEditingIPC(this.ipc, this.session.trusted, this.editing)
      registerAIIPC(this.ipc, this.session.trusted, this.ai)
      registerMCPIPC(this.ipc, this.session.trusted, this.mcp)
      this.registered = true
    } catch (error) {
      this.ipc.dispose()
      throw error
    }
  }

  dispose = (): void => {
    this.ipc.dispose()
    this.registered = false
  }
}
