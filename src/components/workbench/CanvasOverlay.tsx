import type { ReactNode } from 'react'
import { useWorkbenchInsets } from '@renderer/hooks/useWorkbenchInsets'
import { cn } from '@renderer/lib/utils'
import { motion, useReducedMotion } from 'motion/react'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

/** Constrain canvas controls to the visible strip between the overlay panels. */
export const CanvasOverlay = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => {
  const insets = useWorkbenchInsets()
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={cn(
        'pointer-events-none absolute inset-y-0 z-20 min-w-0 [container-type:inline-size]',
        className,
      )}
      initial={false}
      animate={insets}
      transition={reduced ? noMotion : workbenchMotion.panel}
    >
      {children}
    </motion.div>
  )
}
