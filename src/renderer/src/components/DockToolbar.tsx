import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PanelBottom } from 'lucide-react'
import { useDockToolbar } from '@renderer/hooks/useDockToolbar'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'

export const DockToolbar = ({ children, hint }: { children: ReactNode; hint?: ReactNode }) => {
  const { root, handle, open, enter, leave, focus, blur, toggle, expand } = useDockToolbar()
  const reduced = useReducedMotion()
  return (
    <div
      ref={root}
      data-slot="canvas-dock"
      className="pointer-events-none absolute bottom-3 left-1/2 z-40 flex w-[min(calc(100%-2rem),34rem)] -translate-x-1/2 justify-center"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') enter()
      }}
      onPointerMove={(event) => {
        if (!open && event.pointerType !== 'touch') enter()
      }}
      onPointerLeave={leave}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) focus()
      }}
      onBlurCapture={blur}
    >
      {hint && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-20 w-max max-w-full -translate-x-1/2">
          {hint}
        </div>
      )}
      {/* The entry never moves: revealing tools cannot replace the pointer's click target. */}
      <Button
        ref={handle}
        variant="ghost"
        size="sm"
        className="pointer-events-auto h-8 shrink-0 gap-1.5 rounded-full border border-border/80 bg-background/95 px-3 text-[11px] text-muted-foreground shadow-sm backdrop-blur-xl hover:bg-accent hover:text-accent-foreground"
        aria-label="展开浮动工具栏"
        aria-expanded={open}
        aria-controls="floating-map-actions"
        title="导图工具：移入或点击展开"
        onClick={() => {
          if (window.matchMedia('(hover: none)').matches) toggle()
          else expand()
        }}
      >
        <PanelBottom className="size-3.5" />
        <span>工具</span>
      </Button>
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : 8, opacity: open ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        id="floating-map-actions"
        aria-hidden={!open}
        inert={!open}
        className={`absolute bottom-[calc(100%+0.5rem)] w-full rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xl shadow-black/10 ring-1 ring-background/80 backdrop-blur-xl ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <ScrollArea type="auto" className="h-[3.25rem] w-full">
          <div className="w-max pb-1">{children}</div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      </motion.div>
    </div>
  )
}
