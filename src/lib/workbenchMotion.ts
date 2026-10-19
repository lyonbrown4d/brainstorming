import type { Transition } from 'motion/react'

export const noMotion: Transition = { duration: 0 }

/** Short, interruptible UI transitions; canvas geometry and document state stay independent. */
export const workbenchMotion = {
  panel: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  dock: { type: 'spring', stiffness: 420, damping: 36, mass: 0.85 },
  tab: { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 },
  slide: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  item: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
} satisfies Record<string, Transition>
