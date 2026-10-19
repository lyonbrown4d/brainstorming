import { create } from 'zustand'
import { getNearestEditorFromDOMNode } from 'lexical'
import { useEditor } from '@renderer/state/editor'
import { usePasswordPrompt } from '@renderer/state/password'
import { usePresentation } from '@renderer/state/presentation'

interface CommandPaletteState {
  open: boolean
  returnFocus: HTMLElement | null
}

export const useCommandPaletteState = create<CommandPaletteState>(() => ({
  open: false,
  returnFocus: null,
}))

export const commandPaletteAvailable = (): boolean =>
  !useEditor.getState().busy &&
  !usePasswordPrompt.getState().request &&
  !usePresentation.getState().playing

export const commandPaletteCompositionActive = (): boolean => {
  const active = typeof document === 'undefined' ? null : document.activeElement
  return active ? (getNearestEditorFromDOMNode(active)?.isComposing() ?? false) : false
}

export const openCommandPalette = (pathname = '', origin?: HTMLElement): boolean => {
  if (pathname === '/settings' || !commandPaletteAvailable() || commandPaletteCompositionActive())
    return false
  if (
    typeof document !== 'undefined' &&
    document.querySelector(
      '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [role="menu"][data-state="open"]',
    )
  )
    return false
  const active = typeof document === 'undefined' ? null : document.activeElement
  const returnFocus =
    origin ?? (typeof HTMLElement !== 'undefined' && active instanceof HTMLElement ? active : null)
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return false
  useCommandPaletteState.setState({ open: true, returnFocus })
  return true
}

export const closeCommandPalette = (): void => {
  useCommandPaletteState.setState({ open: false })
}
