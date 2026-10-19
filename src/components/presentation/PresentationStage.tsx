import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

/** Replace a single current slide immediately; never retain an outgoing page or the whole deck. */
export const PresentationStage = ({
  pageKey,
  children,
}: {
  pageKey: string
  children: ReactNode
}) => {
  const reduced = useReducedMotion()
  return (
    <motion.div
      key={pageKey}
      className="min-w-0 w-full"
      initial={reduced ? false : { opacity: 0, y: 8, scale: 0.997 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? noMotion : workbenchMotion.slide}
    >
      {children}
    </motion.div>
  )
}
