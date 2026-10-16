import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PanelBottom } from 'lucide-react'
import { useDockToolbar } from '../hooks/useDockToolbar'
import { Button } from './ui/button'
import { ScrollArea, ScrollBar } from './ui/scroll-area'

export function DockToolbar({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  const { root, open, enter, leave, focus, blur, toggle, expand } = useDockToolbar()
  const reduced = useReducedMotion()
  const spring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.75 } as const
  return (
    <div
      ref={root}
      data-slot="canvas-dock"
      className="absolute bottom-4 left-1/2 z-40 w-max max-w-[min(calc(100%-2rem),70rem)] -translate-x-1/2 pt-3"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') enter()
      }}
      onPointerLeave={leave}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) focus()
      }}
      onBlurCapture={blur}
    >
      {hint && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-full -translate-x-1/2">
          {hint}
        </div>
      )}
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : 5 }}
        transition={reduced ? { duration: 0 } : spring}
        className="flex max-w-full items-center rounded-[22px] border border-white/70 bg-background/85 p-2 shadow-[0_8px_30px_-12px_#352d4d40,inset_0_1px_0_#fff] ring-1 ring-foreground/5 backdrop-blur-xl [&_[data-slot=button]]:transition-[transform,background-color,color,box-shadow] [&_[data-slot=button]]:duration-200 [&_[data-slot=button]:hover]:-translate-y-0.5 motion-reduce:[&_[data-slot=button]]:transform-none"
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1.5 rounded-xl px-2 text-xs"
          aria-label="展开浮动工具栏"
          aria-expanded={open}
          aria-controls="floating-map-actions"
          title="导图工具：移入或点击展开"
          onClick={() => {
            if (window.matchMedia('(hover: none)').matches) toggle()
            else expand()
          }}
        >
          <PanelBottom className="size-4" />
          <span>工具</span>
        </Button>
        <motion.div
          id="floating-map-actions"
          initial={false}
          animate={{ width: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  width: open ? spring : { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: open ? 0.18 : 0.1, delay: open ? 0.06 : 0 },
                }
          }
          aria-hidden={!open}
          inert={!open}
          className="min-w-0 overflow-hidden"
        >
          {/* Animate the reveal width, keeping the controls at their natural size. */}
          <ScrollArea type="auto" className="h-11 w-max max-w-[min(calc(100cqw-8rem),64rem)]">
            <div className="w-max px-1 pb-1">{children}</div>
            <ScrollBar orientation="horizontal" className="h-1.5" />
          </ScrollArea>
        </motion.div>
      </motion.div>
    </div>
  )
}
