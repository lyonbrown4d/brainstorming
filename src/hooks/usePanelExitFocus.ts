import { useEffect, useRef, type FocusEvent } from 'react'

/** A closing desktop panel returns its own keyboard focus to the preserved canvas. */
export const usePanelExitFocus = (present: boolean) => {
  const root = useRef<HTMLDivElement>(null)
  const focusedWithin = useRef(false)
  useEffect(() => {
    if (
      !present &&
      focusedWithin.current &&
      (document.activeElement === document.body || root.current?.contains(document.activeElement))
    ) {
      document.getElementById('sheet-panel')?.focus({ preventScroll: true })
    }
  }, [present])
  const onFocusCapture = (): void => {
    focusedWithin.current = true
  }
  const onBlurCapture = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
      focusedWithin.current = false
  }
  return { root, onFocusCapture, onBlurCapture }
}
