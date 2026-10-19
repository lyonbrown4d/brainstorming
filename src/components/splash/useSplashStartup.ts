import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { languageFromLocale, type AppLanguage } from '@shared/language'
import type { StartupPhase } from '@shared/startup'
import { splashText } from '@renderer/splashI18n'

interface StartupSnapshot {
  readonly phase: StartupPhase
  readonly language: AppLanguage
}

interface StartupEvents {
  readonly 'native:startup-phase': StartupPhase
  readonly 'native:language': AppLanguage
}

const request = <T>(method: 'splashMounted' | 'splashRetry' | 'splashQuit'): Promise<T> =>
  invoke('native_request', { method, args: {} })

/** The native host owns startup and the main-window handoff; this only observes it. */
export const useSplashStartup = () => {
  const [state, setState] = useState<StartupSnapshot>({
    phase: 'loading',
    language: languageFromLocale(navigator.language),
  })
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let active = true
    const subscriptions: (() => void)[] = []
    const subscribe = async <K extends keyof StartupEvents>(
      event: K,
      update: (payload: StartupEvents[K]) => void,
    ): Promise<void> => {
      const unlisten = await listen<StartupEvents[K]>(event, ({ payload }) => {
        if (active) update(payload)
      })
      if (active) subscriptions.push(unlisten)
      else unlisten()
    }
    void Promise.all([
      subscribe('native:startup-phase', (phase) => {
        setState((previous) => ({ ...previous, phase }))
      }),
      subscribe('native:language', (language) => {
        setState((previous) => ({ ...previous, language }))
      }),
    ])
      .then(() => (active ? request<StartupSnapshot>('splashMounted') : undefined))
      .then((snapshot) => {
        if (active && snapshot) setState(snapshot)
      })
      .catch((error: unknown) => {
        console.error(error)
        if (active) setState((previous) => ({ ...previous, phase: 'failed' }))
      })
    return () => {
      active = false
      subscriptions.forEach((unlisten) => {
        unlisten()
      })
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = state.language
    document.title = splashText('title', state.language)
  }, [state.language])

  useEffect(() => {
    if (state.phase !== 'loading') return
    const timer = window.setTimeout(() => {
      setState((previous) =>
        previous.phase === 'loading' ? { ...previous, phase: 'slow' } : previous,
      )
    }, 15_000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [state.phase])

  const retry = async (): Promise<void> => {
    if (retrying) return
    setRetrying(true)
    try {
      await request('splashRetry')
    } catch (error) {
      console.error(error)
      setState((previous) => ({ ...previous, phase: 'failed' }))
    } finally {
      setRetrying(false)
    }
  }
  const quit = (): void => {
    void request('splashQuit').catch(console.error)
  }
  return { ...state, retrying, retry, quit }
}
