import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** A single title reveal per page; thumbnails and the editor remain static. */
export const PresentationHeading = ({
  children,
  className,
  animate,
}: {
  children: ReactNode
  className: string
  animate: boolean
}) => {
  const reduced = useReducedMotion()
  return (
    <motion.header
      className={className}
      initial={animate && !reduced ? { clipPath: 'inset(0 0 100% 0)', opacity: 0.6 } : false}
      animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }}
      transition={{ duration: reduced || !animate ? 0 : 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.header>
  )
}
