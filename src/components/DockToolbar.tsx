import { useMessages } from '@renderer/i18n/useMessages'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PanelBottom, PanelTop } from 'lucide-react'
import { useDockToolbar } from '@renderer/hooks/useDockToolbar'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'

export const DockToolbar = ({
  children,
  hint,
  edge = 'bottom',
  label,
  caption,
  id = 'floating-map-actions',
  pinInteraction = true,
}: {
  children: ReactNode
  hint?: ReactNode
  edge?: 'top' | 'bottom'
  label?: string
  caption?: string
  id?: string
  pinInteraction?: boolean
}) => {
  const { translate } = useMessages()

  const { root, handle, open, enter, leave, focus, blur, toggle, expand } = useDockToolbar({
    pinInteraction,
  })
  const reduced = useReducedMotion()
  return (
    <div
      ref={root}
      data-slot={edge === 'top' ? 'document-dock' : 'canvas-dock'}
      data-edge={edge}
      className={`pointer-events-none absolute left-1/2 z-40 flex ${edge === 'top' ? 'w-[min(calc(100%-2rem),30rem)]' : 'w-[min(calc(100%-2rem),32rem)]'} -translate-x-1/2 justify-center ${edge === 'top' ? 'top-3' : 'bottom-3'}`}
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
        <div
          className={`pointer-events-none absolute left-1/2 w-max max-w-full -translate-x-1/2 ${edge === 'top' ? 'top-full mt-20' : 'bottom-full mb-20'}`}
        >
          {hint}
        </div>
      )}
      {/* The entry never moves: revealing tools cannot replace the pointer's click target. */}
      <Button
        ref={handle}
        variant="ghost"
        size="sm"
        className="pointer-events-auto h-10 shrink-0 gap-1.5 sm:h-7 rounded-full border border-border/70 bg-background/95 px-3 text-[11px] text-muted-foreground shadow-sm backdrop-blur-md hover:bg-accent hover:text-accent-foreground"
        aria-label={label ?? translate('expandFloatingToolbar')}
        aria-expanded={open}
        aria-controls={id}
        title={label ?? translate('mapToolsHoverOrClickToExpand')}
        onClick={() => {
          if (window.matchMedia('(hover: none)').matches) toggle()
          else expand()
        }}
      >
        {edge === 'top' ? <PanelTop className="size-3.5" /> : <PanelBottom className="size-3.5" />}
        <span>{caption ?? translate('tools')}</span>
      </Button>
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : edge === 'top' ? -8 : 8, opacity: open ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        id={id}
        aria-hidden={!open}
        inert={!open}
        className={`absolute ${edge === 'top' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]'} w-full rounded-xl border border-border/80 bg-background/95 p-1 shadow-floating backdrop-blur-md ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <ScrollArea type="auto" className={edge === 'top' ? 'h-10 w-full' : 'h-[3.25rem] w-full'}>
          <div className="w-max pb-1">{children}</div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      </motion.div>
    </div>
  )
}
