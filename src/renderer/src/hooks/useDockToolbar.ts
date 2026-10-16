import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/editor'
import { useAnnotationInteraction } from '../state/annotationInteraction'
import { isCompositionKey } from '../state/keyboard'

function hasOpenPanel(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper]',
    ),
  )
}
export function useDockToolbar() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const inside = useRef(false)
  const keyboard = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pinned = useAnnotationInteraction(
    (state) => Boolean(state.fromId) || state.floating || state.editing,
  )
  const editing = useEditor((state) => state.editingId !== null)
  const locked = (): boolean => {
    const state = useAnnotationInteraction.getState()
    return (
      Boolean(state.fromId) ||
      state.floating ||
      state.editing ||
      useEditor.getState().editingId !== null
    )
  }
  const expand = (): void => {
    clearTimeout(timer.current)
    setOpen(true)
  }
  const schedule = (): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (
        inside.current ||
        locked() ||
        hasOpenPanel() ||
        (keyboard.current && root.current?.contains(document.activeElement))
      )
        return
      setOpen(false)
    }, 450)
  }
  useEffect(() => {
    if (pinned || editing) setOpen(true)
    else if (!inside.current) schedule()
  }, [pinned, editing])
  useEffect(() => {
    const changed = (): void => {
      if (!inside.current) schedule()
    }
    const observer = new MutationObserver(changed)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })
    const keys = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') keyboard.current = true
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isCompositionKey(event) ||
        locked() ||
        hasOpenPanel()
      )
        return
      setOpen(false)
    }
    const pointer = (): void => {
      keyboard.current = false
    }
    window.addEventListener('keydown', keys, true)
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('focusin', changed)
    window.addEventListener('focusout', changed)
    return () => {
      clearTimeout(timer.current)
      observer.disconnect()
      window.removeEventListener('keydown', keys, true)
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('focusin', changed)
      window.removeEventListener('focusout', changed)
    }
  }, [])
  return {
    root,
    open,
    expand,
    toggle: () => {
      if (open && !locked() && !hasOpenPanel()) setOpen(false)
      else expand()
    },
    enter: () => {
      inside.current = true
      expand()
    },
    leave: () => {
      inside.current = false
      schedule()
    },
    focus: expand,
    blur: schedule,
  }
}
