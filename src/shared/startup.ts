import type { AppLanguage } from '@shared/language'

export type StartupPhase = 'loading' | 'slow' | 'failed'

export interface StartupAPI {
  ready(): void
  failed(): void
}

export interface SplashAPI {
  mounted(): void
  retry(): void
  quit(): void
  onPhase(callback: (phase: StartupPhase) => void): () => void
  onLanguage(callback: (language: AppLanguage) => void): () => void
}

declare global {
  interface Window {
    readonly trelyxStartup?: StartupAPI
    readonly trelyxSplash?: SplashAPI
  }
}
