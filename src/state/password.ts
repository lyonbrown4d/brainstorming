import { create } from 'zustand'

interface PromptRequest {
  readonly id: number
  readonly title: string
  readonly description?: string
  readonly error?: string
}
interface PromptState {
  readonly request: PromptRequest | null
}
export const usePasswordPrompt = create<PromptState>(() => ({ request: null }))
let finishPrompt: ((password: string | null) => void) | null = null
let promptId = 0
export const requestPassword = (
  title: string,
  description?: string,
  error?: string,
): Promise<string | null> => {
  finishPrompt?.(null)
  return new Promise((resolve) => {
    finishPrompt = resolve
    promptId += 1
    usePasswordPrompt.setState({
      request: {
        id: promptId,
        title,
        ...(description === undefined ? {} : { description }),
        ...(error === undefined ? {} : { error }),
      },
    })
  })
}
export const answerPassword = (password: string | null): void => {
  const finish = finishPrompt
  finishPrompt = null
  usePasswordPrompt.setState({ request: null })
  finish?.(password)
}
interface SecurityView {
  readonly documentId: string | null
  readonly encrypted: boolean
  readonly lockedRecovery: boolean
}
export const useFileSecurityState = create<SecurityView>(() => ({
  documentId: null,
  encrypted: false,
  lockedRecovery: false,
}))
export const resetFileSecurityState = (): void => {
  useFileSecurityState.setState({ documentId: null, encrypted: false })
}
