import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import { useEditor } from '../state/editor'
import { isCompositionKey } from '../state/keyboard'
import {
  capturePresentationViewport,
  showPresentationStep,
  stopPresentation,
  usePresentation,
} from '../state/presentation'
import { useSpatialView } from '../state/spatial'

/** Synchronize transient playback with viewport, focus, keyboard and browser fullscreen. */
export function usePresentationPlayback() {
  const flow = useReactFlow()
  const presentation = usePresentation()
  const sheetId = useEditor((state) => state.activeSheetId)
  const spatial = useSpatialView((state) => state.sheets[sheetId]?.mode === '3d')
  const reducedMotion = useReducedMotion()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const changed = (): void => {
      setFullscreen(Boolean(document.fullscreenElement))
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
  }, [])
  useEffect(() => {
    if (!presentation.playing) return
    const previous = document.activeElement
    const controls = document.querySelector<HTMLElement>('[data-presentation-controls]')
    controls?.focus({ preventScroll: true })
    return () => {
      requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected)
          previous.focus({ preventScroll: true })
        else document.getElementById('sheet-panel')?.focus({ preventScroll: true })
      })
    }
  }, [presentation.playing])
  useEffect(() => {
    if (!presentation.playing || spatial) return
    capturePresentationViewport(flow.getViewport())
    const step = presentation.steps[presentation.index]
    if (!step) return
    const frame = requestAnimationFrame(() => {
      void flow.fitView({
        nodes: [{ id: step.topicId }],
        padding: 0.5,
        minZoom: 0.4,
        maxZoom: 1.2,
        duration: reducedMotion ? 0 : 250,
      })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [flow, presentation.index, presentation.playing, presentation.steps, reducedMotion, spatial])
  useEffect(() => {
    const request = presentation.viewportRequest
    if (request?.sheetId === sheetId && !spatial)
      void flow.setViewport(request.view, { duration: 0 })
  }, [flow, presentation.viewportRequest, sheetId, spatial])
  useEffect(() => {
    if (!presentation.playing) return
    const handler = (event: KeyboardEvent): void => {
      if (isCompositionKey(event)) return
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopImmediatePropagation()
        const buttons = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '[data-presentation-controls] button:not(:disabled)',
          ),
        ]
        const current = buttons.findIndex((item) => item === document.activeElement)
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
        return
      }
      const button =
        event.target instanceof Element &&
        event.target.closest('[data-presentation-controls] button')
      if (button && (event.key === 'Enter' || event.key === ' ')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        stopPresentation()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const { index, steps } = usePresentation.getState()
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key))
        showPresentationStep(Math.max(0, index - 1))
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key))
        showPresentationStep(Math.min(steps.length - 1, index + 1))
      else if (event.key === 'Home') showPresentationStep(0)
      else if (event.key === 'End') showPresentationStep(steps.length - 1)
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
    }
  }, [presentation.playing])
  useEffect(() => {
    if (
      presentation.playing ||
      !document.fullscreenElement?.hasAttribute('data-presentation-fullscreen')
    )
      return
    document.fullscreenElement.removeAttribute('data-presentation-fullscreen')
    void document.exitFullscreen().catch(() => undefined)
  }, [presentation.playing])

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      document.fullscreenElement.removeAttribute('data-presentation-fullscreen')
      void document.exitFullscreen().catch(() => undefined)
    } else {
      const element = document.documentElement
      if (!document.fullscreenEnabled) return
      void element
        .requestFullscreen()
        .then(() => {
          if (usePresentation.getState().playing)
            element.setAttribute('data-presentation-fullscreen', '')
          else void document.exitFullscreen().catch(() => undefined)
        })
        .catch(() => undefined)
    }
  }
  return { presentation, fullscreen, toggleFullscreen }
}
