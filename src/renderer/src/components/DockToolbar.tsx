import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PanelTop } from 'lucide-react'
import { useDockToolbar } from '../hooks/useDockToolbar'
import { Button } from './ui/button'

export function DockToolbar({ children }: { children: ReactNode }) {
  const { root, open, enter, leave, focus, blur, toggle, expand } = useDockToolbar()
  const reduced = useReducedMotion()
  return (
    <div
      ref={root}
      className="absolute top-5 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 pb-3"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') enter()
      }}
      onPointerLeave={leave}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) focus()
      }}
      onBlurCapture={blur}
    >
      <motion.div
        layout
        transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
        className="flex max-w-full items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-md"
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs"
          aria-label="展开浮动工具栏"
          aria-expanded={open}
          aria-controls="floating-map-actions"
          title="导图工具：移入或点击展开"
          onClick={() => {
            if (window.matchMedia('(hover: none)').matches) toggle()
            else expand()
          }}
        >
          <PanelTop className="size-4" />
          <span>工具</span>
        </Button>
        <div id="floating-map-actions" hidden={!open} className="min-w-0">
          {children}
        </div>
      </motion.div>
    </div>
  )
}
