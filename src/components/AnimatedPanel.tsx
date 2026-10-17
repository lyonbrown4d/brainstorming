import { motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export const AnimatedPanel = ({
  children,
  side = 'left',
}: {
  children: ReactNode
  side?: 'left' | 'right'
}) => {
  const present = useIsPresent()
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={`absolute inset-y-0 z-30 flex min-h-0 overflow-hidden bg-background [&>aside]:h-full ${side === 'left' ? 'left-0' : 'right-0'}`}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: side === 'left' ? 216 : 256, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {children}
    </motion.div>
  )
}
