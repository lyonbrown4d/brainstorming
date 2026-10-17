import { useEffect, useRef } from 'react'

export const useCreationStepFocus = (step: 1 | 2) => {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [step])
  return { headingRef, scrollRef }
}
