import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlatformAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import { isCompositionKey } from '@renderer/state/keyboard'
import {
  advancePresentation,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '@renderer/state/presentation'

const reportError = (error: unknown): void => {
  useEditor.getState().setError(error instanceof Error ? error.message : String(error))
}

/** Playback owns only its independent slide surface, keyboard focus and fullscreen. */
export const usePresentationPlayback = () => {
  const presentation = usePresentation()
  const api = getPlatformAPI()
  const ownsNativeFullscreen = useRef(false)
  const fullscreenPending = useRef(false)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!api?.toggleFullScreen) return
    let alive = true
    let changed = false
    void api
      .getWindowState()
      .then((state) => {
        if (alive && !changed) setFullscreen(state.fullScreen)
      })
      .catch(reportError)
    const unsubscribe = api.onWindowStateChanged((state) => {
      changed = true
      setFullscreen(state.fullScreen)
      if (!state.fullScreen && ownsNativeFullscreen.current) {
        ownsNativeFullscreen.current = false
        stopPresentation()
      }
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [api])
  useEffect(() => {
    const changed = (): void => {
      if (!api?.toggleFullScreen) setFullscreen(Boolean(document.fullscreenElement))
      if (
        !document.fullscreenElement &&
        document.documentElement.hasAttribute('data-presentation-fullscreen')
      ) {
        document.documentElement.removeAttribute('data-presentation-fullscreen')
        stopPresentation()
      }
    }
    document.addEventListener('fullscreenchange', changed)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
    }
  }, [api])
  useEffect(() => {
    if (!presentation.playing) return
    const previous = document.activeElement
    document
      .querySelector<HTMLElement>('[data-presentation-surface]')
      ?.focus({ preventScroll: true })
    const handler = (event: KeyboardEvent): void => {
      if (isCompositionKey(event) || event.ctrlKey || event.metaKey || event.altKey) return
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return
      // Radix owns keyboard navigation and Escape while a playback overlay is open.
      if (document.querySelector('[data-presentation-page-jump][data-state="open"]')) return
      if (event.key === 'Tab') return
      const button = event.target instanceof Element && event.target.closest('button')
      if (button && (event.key === 'Enter' || event.key === ' ')) return
      if (
        ![
          'Escape',
          'ArrowLeft',
          'ArrowUp',
          'ArrowRight',
          'ArrowDown',
          'PageUp',
          'PageDown',
          ' ',
          'Home',
          'End',
        ].includes(event.key)
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') stopPresentation()
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) advancePresentation(-1)
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key))
        advancePresentation(1)
      else if (event.key === 'Home') showPresentationStep(0)
      else if (event.key === 'End')
        showPresentationStep(usePresentation.getState().steps.length - 1)
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true })
      else
        document
          .querySelector<HTMLElement>('[data-presentation-composer] button')
          ?.focus({ preventScroll: true })
    }
  }, [presentation.playing, presentation.workspaceMode])
  const exitOwnedFullscreen = useCallback((): void => {
    if (ownsNativeFullscreen.current && api?.toggleFullScreen) {
      ownsNativeFullscreen.current = false
      void api
        .getWindowState()
        .then((state) => (state.fullScreen ? api.toggleFullScreen?.() : undefined))
        .catch(reportError)
    }
    if (document.fullscreenElement?.hasAttribute('data-presentation-fullscreen')) {
      document.fullscreenElement.removeAttribute('data-presentation-fullscreen')
      void document.exitFullscreen().catch(reportError)
    }
  }, [api])
  useEffect(() => {
    if (!presentation.playing) exitOwnedFullscreen()
  }, [presentation.playing, exitOwnedFullscreen])
  useEffect(
    () => () => {
      exitOwnedFullscreen()
    },
    [exitOwnedFullscreen],
  )
  const toggleFullscreen = (): void => {
    if (api?.toggleFullScreen) {
      if (fullscreenPending.current) return
      fullscreenPending.current = true
      void api
        .getWindowState()
        .then(async (state) => {
          if (!usePresentation.getState().playing) return
          ownsNativeFullscreen.current = !state.fullScreen
          await api.toggleFullScreen?.()
          if (!usePresentation.getState().playing) {
            exitOwnedFullscreen()
            return
          }
          setFullscreen(!state.fullScreen)
        })
        .catch((error: unknown) => {
          ownsNativeFullscreen.current = false
          reportError(error)
        })
        .finally(() => {
          fullscreenPending.current = false
        })
    } else if (document.fullscreenElement) {
      document.fullscreenElement.removeAttribute('data-presentation-fullscreen')
      void document.exitFullscreen().catch(reportError)
    } else if (document.fullscreenEnabled) {
      const element = document.documentElement
      void element
        .requestFullscreen()
        .then(() => {
          if (usePresentation.getState().playing)
            element.setAttribute('data-presentation-fullscreen', '')
          else void document.exitFullscreen().catch(reportError)
        })
        .catch(reportError)
    }
  }
  return {
    presentation,
    fullscreen,
    toggleFullscreen,
    fullscreenAvailable: api?.toggleFullScreen !== undefined || document.fullscreenEnabled,
  }
}
