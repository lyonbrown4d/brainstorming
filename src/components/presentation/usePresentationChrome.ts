import { useRef, useState } from 'react'
import { useDebounceFn, useEventListener, useFocusWithin, useMemoizedFn, useMount } from 'ahooks'

/** Idle playback recedes; keyboard focus and an open page picker always keep controls visible. */
export const usePresentationChrome = (heldOpen: boolean) => {
  const controlsRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)
  const [focused, setFocused] = useState(false)
  const { run: scheduleHide } = useDebounceFn(
    () => {
      setActive(false)
    },
    { wait: 2600 },
  )
  const reveal = useMemoizedFn(() => {
    setActive(true)
    scheduleHide()
  })
  useMount(reveal)
  useFocusWithin(controlsRef, { onChange: setFocused })
  // Capture before the global slide shortcuts consume the key event.
  useEventListener(['pointermove', 'pointerdown', 'keydown'], reveal, { capture: true })
  return { controlsRef, visible: active || focused || heldOpen }
}
