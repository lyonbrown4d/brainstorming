import type { BrowserWindow } from 'electron'
import type { AISettingsStore, PrivateAISettings } from '@main/ai/settings'
import { generateMindMap } from '@main/ai/service'
import { validateRequest } from '@main/ai/validation'
import type { AIGenerateRequest, AIResult } from '@shared/ai'

export type GenerateAI = (
  settings: PrivateAISettings,
  request: AIGenerateRequest,
  signal: AbortSignal,
) => Promise<AIResult>
export type SettingsStore = Pick<AISettingsStore, 'get' | 'save' | 'privateSettings'>

/** One request slot per owning renderer; the application owns cancellation and disposal. */
export class AIService {
  private readonly pending = new Map<
    number,
    { id: string; controller: AbortController; finished: Promise<void> }
  >()
  private disposed = false
  constructor(
    readonly settings: SettingsStore,
    private readonly generate: GenerateAI = generateMindMap,
  ) {}

  run = (window: BrowserWindow, owner: number, input: unknown): Promise<AIResult> => {
    if (this.disposed) throw new Error('AI 服务已关闭')
    const request = validateRequest(input)
    if (this.pending.has(owner)) throw new Error('已有 AI 请求正在进行，请等待或取消')
    const controller = new AbortController()
    const abort = (): void => {
      controller.abort()
    }
    const navigation = (
      _event: unknown,
      _url: string,
      _inPlace: boolean,
      isMainFrame: boolean,
    ): void => {
      if (isMainFrame) abort()
    }
    window.once('closed', abort)
    window.webContents.once('render-process-gone', abort)
    window.webContents.on('did-start-navigation', navigation)
    const operation = Promise.resolve()
      .then(() => this.settings.privateSettings())
      .then((settings) => this.generate(settings, request, controller.signal))
      .finally(() => {
        this.pending.delete(owner)
        window.removeListener('closed', abort)
        window.webContents.removeListener('render-process-gone', abort)
        window.webContents.removeListener('did-start-navigation', navigation)
      })
    this.pending.set(owner, {
      id: request.requestId,
      controller,
      finished: operation.then(
        () => undefined,
        () => undefined,
      ),
    })
    return operation
  }

  cancel = async (owner: number, id: unknown): Promise<void> => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new Error('AI 请求标识无效')
    const request = this.pending.get(owner)
    if (request?.id === id) {
      request.controller.abort()
      await request.finished
    }
  }

  dispose = async (): Promise<void> => {
    this.disposed = true
    const pending = [...this.pending.values()]
    for (const request of pending) request.controller.abort()
    await Promise.all(pending.map((request) => request.finished))
  }
}
