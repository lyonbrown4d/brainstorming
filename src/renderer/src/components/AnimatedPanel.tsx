import { motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export function AnimatedPanel({
  children,
  side = 'left',
}: {
  children: ReactNode
  side?: 'left' | 'right'
}) {
  const present = useIsPresent()
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="panel-presence"
      initial={{ x: side === 'left' ? -12 : 12, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: side === 'left' ? -12 : 12, opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {children}
    </motion.div>
  )
}
