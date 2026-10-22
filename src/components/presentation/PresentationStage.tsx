import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

/** Replace a single current slide immediately; never retain an outgoing page or the whole deck. */
export const PresentationStage = ({
  pageKey,
  index,
  children,
}: {
  pageKey: string
  index?: number
  children: ReactNode
}) => {
  const reduced = useReducedMotion()
  const [trackedPage, setTrackedPage] = useState({ pageKey, index, previousIndex: index })
  if (trackedPage.pageKey !== pageKey) {
    setTrackedPage({ pageKey, index, previousIndex: trackedPage.index })
  }
  const direction =
    index === undefined || trackedPage.previousIndex === undefined
      ? 0
      : Math.sign(index - trackedPage.previousIndex)
  return (
    <motion.div
      key={pageKey}
      className="min-w-0 w-full"
      initial={
        reduced || direction === 0 ? false : { opacity: 0.82, x: direction * 40, scale: 0.99 }
      }
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={reduced ? noMotion : workbenchMotion.slide}
    >
      {children}
    </motion.div>
  )
}
