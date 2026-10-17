import type { IPCRegistry, TrustedWindow } from '@main/application/ipcRegistry'
import type { AIService } from '@main/ai/application'

export const registerAIIPC = (ipc: IPCRegistry, trusted: TrustedWindow, ai: AIService): void => {
  ipc.handle('ai:settings:get', (event) => {
    trusted(event)
    return ai.settings.get()
  })
  ipc.handle('ai:settings:save', (event, input: unknown) => {
    trusted(event)
    return ai.settings.save(input)
  })
  ipc.handle('ai:generate', (event, input: unknown) => {
    return ai.run(trusted(event), event.sender.id, input)
  })
  ipc.handle('ai:cancel', (event, id: unknown) => {
    trusted(event)
    return ai.cancel(event.sender.id, id)
  })
}
