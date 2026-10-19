import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounceFn, useEventListener, useMutationObserver } from 'ahooks'
import { useEditor } from '@renderer/state/editor'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { isCompositionKey } from '@renderer/state/keyboard'
import { useCanvasInk } from '@renderer/state/canvasInk'

const hasOpenPanel = (): boolean => {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
    ),
  )
}

const isInteractionPinned = (): boolean => {
  const state = useAnnotationInteraction.getState()
  return (
    state.relationMode ||
    state.floating ||
    state.editing ||
    useCanvasInk.getState().mode !== 'select' ||
    useEditor.getState().editingId !== null
  )
}

export const useDockToolbar = ({ pinInteraction = true }: { pinInteraction?: boolean } = {}) => {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const inside = useRef(false)
  const keyboard = useRef(false)
  const restoringFocus = useRef(false)
  const pinned = useAnnotationInteraction(
    (state) => state.relationMode || state.floating || state.editing,
  )
  const editing = useEditor((state) => state.editingId !== null)
  const inking = useCanvasInk((state) => state.mode !== 'select')
  const { run: schedule, cancel } = useDebounceFn(
    (): void => {
      if (
        window.matchMedia('(hover: none)').matches ||
        inside.current ||
        (pinInteraction && isInteractionPinned()) ||
        hasOpenPanel() ||
        (keyboard.current && root.current?.contains(document.activeElement))
      )
        return
      setOpen(false)
    },
    { wait: 450 },
  )
  const expand = useCallback((): void => {
    cancel()
    setOpen(true)
  }, [cancel])
  useEffect(() => {
    if (pinInteraction && (pinned || editing || inking)) expand()
    else if (!inside.current) schedule()
  }, [pinInteraction, pinned, editing, inking, expand, schedule])
  const changed = (): void => {
    if (!inside.current) schedule()
  }
  useMutationObserver(changed, () => document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state'],
  })
  useEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') keyboard.current = true
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isCompositionKey(event) ||
        (pinInteraction && isInteractionPinned()) ||
        hasOpenPanel()
      )
        return
      // Focus the fixed entry before the panel becomes inert.
      if (root.current?.contains(document.activeElement)) {
        restoringFocus.current = true
        handle.current?.focus({ preventScroll: true })
        restoringFocus.current = false
      }
      cancel()
      setOpen(false)
    },
    { capture: true },
  )
  useEventListener(
    'pointerdown',
    () => {
      keyboard.current = false
    },
    { capture: true },
  )
  useEventListener('focusin', changed)
  useEventListener('focusout', changed)
  return {
    root,
    handle,
    open,
    expand,
    toggle: () => {
      if (open && !(pinInteraction && isInteractionPinned()) && !hasOpenPanel()) setOpen(false)
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
    focus: () => {
      if (!restoringFocus.current) expand()
    },
    blur: schedule,
  }
}
