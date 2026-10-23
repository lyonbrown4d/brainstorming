import { OUTLINE_WIDTH, INSPECTOR_WIDTH } from '@shared/workbench'
import { motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'
import { usePanelExitFocus } from '@renderer/hooks/usePanelExitFocus'

export const AnimatedPanel = ({
  children,
  side = 'left',
}: {
  children: ReactNode
  side?: 'left' | 'right'
}) => {
  const present = useIsPresent()
  const reduceMotion = useReducedMotion()
  const { root, ...focus } = usePanelExitFocus(present)
  const offset = side === 'left' ? -14 : 14
  return (
    <motion.div
      ref={root}
      data-workbench-panel
      {...focus}
      className={`absolute inset-y-0 z-30 flex min-h-0 overflow-hidden bg-background shadow-floating [&>aside]:h-full ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{ width: side === 'left' ? OUTLINE_WIDTH : INSPECTOR_WIDTH }}
      initial={reduceMotion ? false : { x: offset, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: reduceMotion ? 0 : offset, opacity: 0 }}
      transition={reduceMotion ? noMotion : workbenchMotion.panel}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {children}
    </motion.div>
  )
}
