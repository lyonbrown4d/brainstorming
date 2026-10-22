import { useMessages } from '@renderer/i18n/useMessages'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PanelBottom, PanelTop } from 'lucide-react'
import { useDockToolbar } from '@renderer/hooks/useDockToolbar'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { noMotion, workbenchMotion } from '@renderer/lib/workbenchMotion'

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
        className="pointer-events-auto h-10 shrink-0 gap-1.5 rounded-full border border-border/80 bg-background px-3 text-[11px] font-medium text-secondary-foreground shadow-floating transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-border hover:bg-accent hover:text-foreground active:bg-secondary focus-visible:text-foreground sm:h-7"
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
        animate={{
          y: open || reduced ? 0 : edge === 'top' ? -8 : 8,
          scale: open || reduced ? 1 : 0.98,
          opacity: open ? 1 : 0,
        }}
        transition={reduced ? noMotion : workbenchMotion.dock}
        style={{ transformOrigin: edge === 'top' ? 'top center' : 'bottom center' }}
        id={id}
        aria-hidden={!open}
        inert={!open}
        className={`absolute ${edge === 'top' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]'} w-full rounded-xl border border-border/80 bg-background p-1 shadow-floating ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <ScrollArea type="auto" className={edge === 'top' ? 'h-10 w-full' : 'h-[3.25rem] w-full'}>
          <div className="w-max pb-1">{children}</div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      </motion.div>
    </div>
  )
}
